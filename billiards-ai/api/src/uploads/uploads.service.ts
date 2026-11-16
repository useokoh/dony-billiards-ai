// 영상 업로드 후 분석 실행: 궤적 → 샷 판정 → 샷 영상 → 샷별 궤적 → DB 저장 (Docs/기술스택.md 6장)
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { projectRoot } from '../media/media-file.js';
import { ResultsImportService } from '../results-import/results-import.service.js';

/** 업로드된 파일 정보 (multer가 넘겨주는 값 중 쓰는 것만) */
export interface UploadedVideo {
  path: string;
  originalname: string;
  size: number;
}

export interface UploadJob {
  id: string;
  video: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  step: string | null;
  progress: number; // 0~100
  matchId: number | null;
  error: string | null;
}

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v'];

// 단계별 진행률 비중 (2시간 영상 기준으로 궤적 추적이 대부분의 시간을 쓴다)
const STEPS: { module: string; label: string; weight: number }[] = [
  { module: 'analyzer.track', label: '궤적 추적', weight: 75 },
  { module: 'analyzer.shots', label: '샷 판정', weight: 5 },
  { module: 'analyzer.clips', label: '샷 영상', weight: 12 },
  { module: 'analyzer.trajectory', label: '샷별 궤적', weight: 5 },
];

/**
 * 저장할 파일 이름을 만든다. 영상 이름의 촬영 시각(예: ..._261101193823.MP4)을 쓰므로 원래 이름을 살리되,
 * 경로에 쓸 수 없는 글자는 바꾸고 같은 이름이 있으면 번호를 붙인다.
 */
export function safeVideoName(
  original: string,
  exists: (name: string) => boolean,
): string {
  const ext = extname(original).toLowerCase();
  if (!VIDEO_EXTENSIONS.includes(ext)) {
    throw new BadRequestException(
      `영상 파일만 올릴 수 있습니다 (${VIDEO_EXTENSIONS.join(', ')})`,
    );
  }
  const base =
    original
      .slice(0, -ext.length)
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 80) || 'video';
  let name = `${base}${extname(original)}`;
  for (let n = 2; exists(name); n += 1)
    name = `${base}-${n}${extname(original)}`;
  return name;
}

/** analyzer.track 출력의 "진행 37% (75초)" 줄에서 진행률을 읽는다. */
export function parseProgress(line: string): number | null {
  const m = /진행 (\d+)%/.exec(line);
  return m ? Number(m[1]) : null;
}

@Injectable()
export class UploadsService {
  // shortcut: 진행 상태를 메모리에만 두어 서버를 재시작하면 사라진다. 여러 서버로 늘릴 때 DB(analysis_runs)로 옮긴다.
  private readonly jobs = new Map<string, UploadJob>();
  // 궤적 추적이 CPU를 거의 다 쓰므로 분석은 한 번에 하나씩 돌린다.
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly importer: ResultsImportService) {}

  /** 올라온 파일을 data/videos로 옮기고 분석을 예약한다. */
  enqueue(file: UploadedVideo | undefined): UploadJob {
    if (!file)
      throw new BadRequestException('video 필드에 영상 파일을 넣어 주세요');
    const root = projectRoot();
    const videosDir = join(root, 'data/videos');
    mkdirSync(videosDir, { recursive: true });
    let name: string;
    try {
      name = safeVideoName(file.originalname, (n) =>
        existsSync(join(videosDir, n)),
      );
    } catch (err) {
      rmSync(file.path, { force: true }); // 거절한 파일이 임시 폴더에 쌓이지 않게 지운다
      throw err;
    }
    renameSync(file.path, join(videosDir, name));

    const job: UploadJob = {
      id: randomUUID(),
      video: name,
      status: 'queued',
      step: null,
      progress: 0,
      matchId: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    this.queue = this.queue.then(() => this.run(job, root));
    return job;
  }

  find(id: string): UploadJob {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('업로드 작업을 찾을 수 없습니다');
    return job;
  }

  private async run(job: UploadJob, root: string): Promise<void> {
    job.status = 'running';
    const video = `data/videos/${job.video}`;
    let done = 0;
    try {
      for (const step of STEPS) {
        job.step = step.label;
        await this.runPython(step.module, video, root, (p) => {
          job.progress = Math.round(done + (step.weight * p) / 100);
        });
        done += step.weight;
        job.progress = done;
      }
      job.step = 'DB 저장';
      const stem = job.video.replace(/\.[^.]+$/, '');
      const summary = await this.importer.importFile(
        join(root, 'data/results/shots', `${stem}.json`),
        root,
      );
      job.matchId = summary.matchId;
      job.progress = 100;
      job.status = 'done';
      job.step = null;
    } catch (err) {
      job.status = 'failed';
      job.error = (err as Error).message;
    }
  }

  /** 분석 모듈 하나를 billiards-ai 폴더에서 실행한다. 실패하면 마지막 출력과 함께 오류를 낸다. */
  private runPython(
    module: string,
    video: string,
    root: string,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    // PYTHON_PATH는 api 폴더 기준 상대 경로라 실행 폴더를 바꾸기 전에 절대 경로로 바꾼다.
    const python = resolve(process.env.PYTHON_PATH ?? 'python3');
    return new Promise((ok, fail) => {
      const child = spawn(python, ['-m', module, video], { cwd: root });
      let tail = '';
      const read = (chunk: Buffer) => {
        const text = chunk.toString();
        tail = (tail + text).slice(-2000);
        for (const line of text.split('\n')) {
          const percent = parseProgress(line);
          if (percent !== null) onProgress(percent);
        }
      };
      child.stdout.on('data', read);
      child.stderr.on('data', read);
      child.on('error', fail);
      child.on('close', (code) =>
        code === 0
          ? ok()
          : fail(
              new Error(
                `${module} 실패 (코드 ${code}): ${tail.trim().split('\n').slice(-3).join(' / ')}`,
              ),
            ),
      );
    });
  }
}
