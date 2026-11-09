import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ROUTE_MODEL } from './route-model.default.js';
import {
  bounceAngle,
  deflectionForCut,
  interp,
  loadRouteModel,
  objectTravel,
  resetRouteModelCache,
} from './route-model.js';

describe('route-model', () => {
  afterEach(() => {
    delete process.env.PROJECT_ROOT;
    resetRouteModelCache();
  });

  it('보간: 표 안은 직선, 바깥은 끝 값', () => {
    expect(interp(15, [10, 20], [0, 10])).toBe(5);
    expect(interp(0, [10, 20], [0, 10])).toBe(0);
    expect(interp(99, [10, 20], [0, 10])).toBe(10);
  });
  it('기본 모델 값이 그럴듯한 범위', () => {
    const m = DEFAULT_ROUTE_MODEL;
    expect(bounceAngle(m.bounce.long, 45)).toBeGreaterThan(45);
    const d = deflectionForCut(m, 40);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(70);
    expect(objectTravel(m, 0.5)).toBeGreaterThan(0);
    // 교차 검증에서 실측 표가 거울 반사보다 나아야 기본값으로 쓴다
    expect(m.validation.path.table.reproduce_rate).toBeGreaterThan(
      m.validation.path.mirror.reproduce_rate,
    );
  });
  it('파일이 없으면 기본값, 있으면 파일 값', () => {
    const root = mkdtempSync(join(tmpdir(), 'route-model-'));
    process.env.PROJECT_ROOT = root;
    expect(loadRouteModel()).toBe(DEFAULT_ROUTE_MODEL);
    resetRouteModelCache();
    mkdirSync(join(root, 'data/results'), { recursive: true });
    const custom = { ...DEFAULT_ROUTE_MODEL, generated: '2099-01-01' };
    writeFileSync(
      join(root, 'data/results/route_model.json'),
      JSON.stringify(custom),
    );
    expect(loadRouteModel().generated).toBe('2099-01-01');
  });
  it('형식이 깨진 파일은 기본값', () => {
    const root = mkdtempSync(join(tmpdir(), 'route-model-'));
    process.env.PROJECT_ROOT = root;
    mkdirSync(join(root, 'data/results'), { recursive: true });
    writeFileSync(join(root, 'data/results/route_model.json'), '{"bounce":{}}');
    expect(loadRouteModel()).toBe(DEFAULT_ROUTE_MODEL);
  });
});
