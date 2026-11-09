// 추천 경로 모델 기본값: analyzer/route_model.py가 실제 경기 영상 2개(219샷)에서 측정한 값 (2026-11-09, version 3)
// data/results/route_model.json이 있으면 그 파일을 우선 쓴다 (route-model.ts). 다시 측정하면:
//   .venv/bin/python -m analyzer.route_model
import type { RouteModel } from './route-model.js';

export const DEFAULT_ROUTE_MODEL: RouteModel = {
  version: 3,
  generated: '2026-11-09',
  bounce: {
    long: {
      table: [
        [5, 9.9],
        [15, 31.22],
        [25, 45.64],
        [35, 52.45],
        [45, 56.89],
        [55, 64.43],
        [65, 71.23],
        [75, 80.28],
        [85, 83.88],
      ],
      n: 356,
      residual_sd: 2.39,
    },
    short: {
      table: [
        [5, 31.33],
        [15, 37.43],
        [25, 45.29],
        [35, 47.7],
        [45, 52.22],
        [55, 61.39],
        [65, 74.0],
        [75, 80.52],
        [85, 84.34],
      ],
      n: 236,
      residual_sd: 3.59,
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
  kinematics: {
    decel: 0.0409,
    retention: 0.722,
    required_speed_quantiles: [19.6, 32.0],
    speed_ratio_by_thickness: [
      {
        lo: 0,
        hi: 0.25,
        median: 0.65,
        n: 73,
      },
      {
        lo: 0.25,
        hi: 0.5,
        median: 0.95,
        n: 42,
      },
      {
        lo: 0.5,
        hi: 0.75,
        median: 1.68,
        n: 27,
      },
      {
        lo: 0.75,
        hi: 1.0,
        median: 0.72,
        n: 15,
      },
    ],
    cue_speed_quantiles: [16.3, 27.2],
    n: {
      decel: 673,
      retention: 495,
      ratio: 157,
    },
  },
  validation: {
    kiss: {
      method:
        '충돌 직후 실제 조건(위치·방향·속도)으로 두 공을 굴려 쫑을 예측하고 궤적의 실제 쫑과 비교 (쿠션 표는 교차 검증)',
      cue_object: {
        n: 144,
        actual: 10,
        accuracy: 0.854,
        baseline_accuracy: 0.931,
        precision: 0.077,
        recall: 0.1,
        confusion: {
          tp: 1,
          fp: 12,
          fn: 9,
          tn: 122,
        },
      },
      object_target: {
        n: 144,
        actual: 8,
        accuracy: 0.951,
        baseline_accuracy: 0.944,
        precision: 1.0,
        recall: 0.125,
        confusion: {
          tp: 1,
          fp: 0,
          fn: 7,
          tn: 136,
        },
      },
      risk: {
        method:
          '조건을 흔들어 120번 굴린 쫑 비율(위험도)이 실제 쫑 샷을 얼마나 구분하는지 (AUC, 0.5 = 구분 못 함)',
        auc: 0.564,
        mean_risk_kiss: 0.134,
        mean_risk_no_kiss: 0.103,
        n: 144,
        actual_kiss: 10,
        human_labels: 0,
      },
    },
    method: '영상별 교차 검증 (한 영상으로 표를 만들고 다른 영상으로 검사)',
    videos: 2,
    per_bounce: {
      mirror: {
        median_deg: 13.2,
        within_5deg: 0.1,
        within_10deg: 0.28,
        n: 592,
      },
      table: {
        median_deg: 2.2,
        within_5deg: 0.68,
        within_10deg: 0.86,
        n: 592,
      },
    },
    path: {
      mirror: {
        reproduce_rate: 0.212,
        strict_rate: 0.071,
        bank_error_cm_median: 13.4,
        n: 99,
      },
      table: {
        reproduce_rate: 0.475,
        strict_rate: 0.303,
        bank_error_cm_median: 4.8,
        n: 99,
      },
    },
    planner_e2e: {
      method:
        '득점 샷에서 실제 들어온 방향과 두께만 주고 꺾임·쿠션 반사를 모델로 굴려 실제와 같은 쿠션 순서로 2적구에 닿는지',
      mirror_stun: {
        reproduce_rate: 0.216,
        strict_rate: 0.033,
        n: 60,
      },
      table: {
        reproduce_rate: 0.3,
        strict_rate: 0.184,
        n: 60,
      },
    },
    path_random_baseline: {
      reproduce_rate: 0.232,
      strict_rate: 0.017,
    },
  },
};
