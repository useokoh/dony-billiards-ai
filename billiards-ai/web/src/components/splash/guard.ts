// 스플래시를 이번 창에서 이미 봤는지 기록하는 키와, 첫 화면 전에 실행하는 스크립트
// (서버 레이아웃과 클라이언트 컴포넌트가 같이 쓰므로 "use client" 파일과 분리한다)

/** 이 값이 sessionStorage에 있으면 이번 창에서는 스플래시를 이미 본 것 */
export const SPLASH_KEY = "dony-splash-seen";

/** layout.tsx <head>에 넣는 스크립트: 본 적 있으면 html에 data-splash="done"을 붙여 숨긴다 */
export const SPLASH_GUARD_SCRIPT = `(function(){try{if(sessionStorage.getItem("${SPLASH_KEY}"))document.documentElement.setAttribute("data-splash","done")}catch(e){}})()`;
