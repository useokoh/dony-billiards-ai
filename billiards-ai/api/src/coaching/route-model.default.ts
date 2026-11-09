// 추천 경로 모델 기본값: analyzer/route_model.py가 실제 경기 영상 2개(219샷)에서 측정한 값 (2026-11-09)
// data/results/route_model.json이 있으면 그 파일을 우선 쓴다 (route-model.ts). 다시 측정하면:
//   .venv/bin/python -m analyzer.route_model
import type { RouteModel } from './route-model.js';

export const DEFAULT_ROUTE_MODEL: RouteModel = {
  version: 2,
  generated: '2026-11-09',
  bounce: {
    long: {
      table: [
        [5, 7.23],
        [15, 34.04],
        [25, 33.25],
        [35, 53.4],
        [45, 57.97],
        [55, 64.86],
        [65, 74.25],
        [75, 81.99],
        [85, 88.43],
      ],
      n: 311,
      residual_sd: 2.49,
    },
    short: {
      table: [
        [5, 17.0],
        [15, 37.18],
        [25, 44.06],
        [35, 49.33],
        [45, 58.73],
        [55, 62.06],
        [65, 74.17],
        [75, 81.59],
      ],
      n: 185,
      residual_sd: 5.32,
    },
  },
  deflection_by_cut: [
    {
      lo: 10,
      hi: 20,
      median: 33.1,
      n: 7,
    },
    {
      lo: 20,
      hi: 30,
      median: 46.9,
      n: 15,
    },
    {
      lo: 30,
      hi: 40,
      median: 34.9,
      n: 18,
    },
    {
      lo: 40,
      hi: 50,
      median: 33.3,
      n: 20,
    },
    {
      lo: 50,
      hi: 60,
      median: 34.5,
      n: 17,
    },
    {
      lo: 60,
      hi: 70,
      median: 17.1,
      n: 14,
    },
    {
      lo: 70,
      hi: 80,
      median: 22.4,
      n: 7,
    },
    {
      lo: 80,
      hi: 90,
      median: 43.9,
      n: 5,
    },
  ],
  deflection_residual_sd: 10.39,
  object_travel_by_thickness: [
    {
      lo: 0,
      hi: 0.25,
      median: 2.23,
      n: 46,
    },
    {
      lo: 0.25,
      hi: 0.5,
      median: 2.94,
      n: 35,
    },
    {
      lo: 0.5,
      hi: 0.75,
      median: 4.2,
      n: 20,
    },
    {
      lo: 0.75,
      hi: 1.01,
      median: 2.7,
      n: 4,
    },
  ],
  validation: {
    method: '영상별 교차 검증 (한 영상으로 표를 만들고 다른 영상으로 검사)',
    videos: 2,
    per_bounce: {
      mirror: {
        median_deg: 14.0,
        within_5deg: 0.1,
        within_10deg: 0.24,
        n: 496,
      },
      table: {
        median_deg: 2.7,
        within_5deg: 0.64,
        within_10deg: 0.77,
        n: 496,
      },
    },
    path: {
      mirror: {
        reproduce_rate: 0.212,
        bank_error_cm_median: 13.4,
        n: 99,
      },
      table: {
        reproduce_rate: 0.464,
        bank_error_cm_median: 6.9,
        n: 99,
      },
    },
  },
};
