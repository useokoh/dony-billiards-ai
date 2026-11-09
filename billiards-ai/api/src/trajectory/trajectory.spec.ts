import { startLayout, toBallPaths } from './trajectory.js';

const row = (ball: string, points: unknown, estimated: unknown = null) => ({
  ball,
  startFrame: 10,
  step: 2,
  points: JSON.stringify(points),
  estimated: estimated === null ? null : JSON.stringify(estimated),
});

describe('toBallPaths / startLayout', () => {
  it('공별 경로와 시작 배치를 만든다', () => {
    const paths = toBallPaths([
      row(
        'white',
        [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        [0, 1],
      ),
      row('yellow', [[0.5, 0.5]]),
      row('red', [[0.9, 0.1]]),
    ]);
    expect(paths!.white!.estimated).toEqual([0, 1]);
    expect(paths!.yellow!.estimated).toEqual([0]); // 없으면 0으로 채움
    expect(startLayout(paths)).toEqual({
      white: [0.1, 0.2],
      yellow: [0.5, 0.5],
      red: [0.9, 0.1],
    });
  });
  it('깨진 행·모르는 공은 빼고, 공이 빠지면 배치는 null', () => {
    const paths = toBallPaths([
      row('white', [[0.1, 0.2]]),
      { ...row('yellow', []), points: 'oops' },
      row('blue', [[0, 0]]),
      row('red', [[1, 'x']]),
    ]);
    expect(Object.keys(paths!)).toEqual(['white']);
    expect(startLayout(paths)).toBeNull();
    expect(toBallPaths([])).toBeNull();
    expect(startLayout(null)).toBeNull();
  });
});
