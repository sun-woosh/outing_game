/** Isolated six-table rehearsal; never touches the live game. */
import { countMinorityChoices } from "./minority-result";
export type SimulationColor = "red" | "black";
export type SimulationQuestion = { question: string; options: string[] };
export type SimulationSettings = { tableCount: number; initialChips: number; minorityRounds: number; minorityBonus: number; minorityQuestions: SimulationQuestion[]; minorityPracticeQuestion: SimulationQuestion; rouletteSpins: number };
export type SimulationPhase = "lobby" | "minority_tutorial" | "minority_play" | "minority_result" | "roulette_tutorial" | "roulette_betting" | "roulette_result" | "finished";
export type SimulationTeam = { id:string; table:number; name:string; chips:number; choice:number|null; change:number; bet:{color:SimulationColor;amount:number}|null; skipped:boolean };
export type SimulationGame = { stage:1|2; phase:SimulationPhase; roulettePracticeSeeded:boolean; settings:SimulationSettings; teams:SimulationTeam[]; minorityPractice:boolean; minorityRound:number; minorityDeadline:number|null; minorityResult:{counts:number[];winningChoices:number[];outcome:"minority"|"tie"|"none"}|null; round:number; result:SimulationColor|null; rouletteSpinStartedAt:number|null; history:{round:number;result:SimulationColor;teams:{id:string;table:number;name:string;color:SimulationColor;amount:number;change:number;chips:number}[]}[] };
export type SimulationAction = {type:"start_minority"|"start_practice"|"start_main"|"auto_vote"|"close_vote"|"next_question"|"start_roulette"|"start_roulette_game"|"auto_bet"|"spin"|"next"|"tick"|"finish_no_chips"} | {type:"jump";target:"minority_practice"|"minority_game"|"roulette_tutorial"|"roulette_betting"} | {type:"vote";teamId:string;choice:number} | {type:"skip_bet"|"undo_skip";teamId:string} | {type:"bet";teamId:string;color:SimulationColor;amount:number};
export const practiceQuestion: SimulationQuestion = { question:"지금 가장 마시고 싶은 음료는?", options:["아이스 아메리카노", "카페라테", "오렌지주스", "탄산수"] };
const random = () => globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random();
function pick(n:number,rng:()=>number) { const v=rng(); if(!Number.isFinite(v)||v<0||v>=1) throw new Error("난수 범위가 올바르지 않습니다."); return Math.floor(v*n); }
export function simulationQuestion(game:SimulationGame):SimulationQuestion { return game.minorityPractice ? game.settings.minorityPracticeQuestion ?? practiceQuestion : game.settings.minorityQuestions[game.minorityRound-1] ?? {question:"질문을 설정해 주세요",options:["보기 1","보기 2"]}; }
export function createHostSimulation(settings:SimulationSettings):SimulationGame { return {stage:1,phase:"lobby",roulettePracticeSeeded:false,settings:{...settings,initialChips:0,tableCount:6,minorityQuestions:settings.minorityQuestions.map(q=>({...q,options:[...q.options]}))},teams:Array.from({length:6},(_,i)=>({id:String(i+1),table:i+1,name:`${i+1}번 테이블`,chips:0,choice:null,change:0,bet:null,skipped:false})),minorityPractice:false,minorityRound:0,minorityDeadline:null,minorityResult:null,round:1,result:null,rouletteSpinStartedAt:null,history:[]}; }
function begin(g:SimulationGame, practice:boolean, round:number, now:number) { g.minorityPractice=practice;g.minorityRound=round;g.minorityDeadline=now+30000;g.minorityResult=null;g.phase="minority_play";for(const t of g.teams){t.choice=null;t.change=0;} }
function settle(g:SimulationGame) { const result=countMinorityChoices(simulationQuestion(g).options.length,g.teams.map(t=>t.choice));g.minorityResult=result;for(const t of g.teams){t.change=t.choice!==null&&result.winningChoices.includes(t.choice)?g.settings.minorityBonus:0;if(!g.minorityPractice)t.chips+=t.change;}g.minorityDeadline=null;g.phase="minority_result"; }
export function hostSimulationAction(input:SimulationGame,action:SimulationAction,now=Date.now(),rng:()=>number=random):SimulationGame {
 let g:SimulationGame=structuredClone(input);
 if(action.type==="jump") {g=createHostSimulation(input.settings);if(action.target==="minority_practice") begin(g,true,0,now);else if(action.target==="minority_game") begin(g,false,1,now);else {g.stage=2;g.phase=action.target;g.roulettePracticeSeeded=true;for(const t of g.teams)t.chips=100;}return g;}

 if(action.type==="tick")return g;
 const requirePhase=(p:SimulationPhase)=>{if(g.phase!==p)throw new Error("현재 단계에서 할 수 없는 동작입니다.");};
 const team=(id:string)=>{const t=g.teams.find(x=>x.id===id);if(!t)throw new Error("테이블을 찾을 수 없습니다.");return t;};
 switch(action.type){
 case "start_minority": requirePhase("lobby");g.phase="minority_tutorial";break;
 case "start_practice": requirePhase("minority_tutorial");begin(g,true,0,now);break;
 case "start_main": requirePhase("minority_result");if(!g.minorityPractice)throw new Error("연습을 먼저 마쳐 주세요.");begin(g,false,1,now);break;
 case "vote": requirePhase("minority_play");if(g.minorityDeadline!==null&&now>=g.minorityDeadline)throw new Error("선택 시간이 끝났습니다.");if(!Number.isInteger(action.choice)||action.choice<0||action.choice>=simulationQuestion(g).options.length)throw new Error("보기를 확인해 주세요.");team(action.teamId).choice=action.choice;break;
 case "auto_vote": requirePhase("minority_play");if(g.minorityDeadline!==null&&now>=g.minorityDeadline)throw new Error("선택 시간이 끝났습니다.");for(const t of g.teams)if(t.choice===null)t.choice=pick(simulationQuestion(g).options.length,rng);break;
 case "close_vote": requirePhase("minority_play");settle(g);break;
 case "next_question": requirePhase("minority_result");if(g.minorityPractice||g.minorityRound>=g.settings.minorityRounds)throw new Error("다음 문제가 없습니다.");begin(g,false,g.minorityRound+1,now);break;
 case "start_roulette": requirePhase("minority_result");if(g.minorityPractice||g.minorityRound<g.settings.minorityRounds)throw new Error("소수의 선택을 먼저 마쳐 주세요.");g.phase="roulette_tutorial";g.stage=2;break;
 case "start_roulette_game": requirePhase("roulette_tutorial");g.phase="roulette_betting";g.round=1;break;
 case "finish_no_chips": if((g.phase!=="roulette_tutorial"&&g.phase!=="roulette_betting")||!g.teams.length||g.teams.some(t=>t.chips>0))throw new Error("칩을 보유한 테이블이 있어 룰렛을 진행해야 합니다.");g.phase="finished";break;
 case "bet": {requirePhase("roulette_betting");const t=team(action.teamId);if(t.skipped||!Number.isSafeInteger(action.amount)||action.amount<1||action.amount>t.chips)throw new Error("베팅 칩을 확인해 주세요.");t.bet={color:action.color,amount:action.amount};break;}
 case "skip_bet": case "undo_skip": {requirePhase("roulette_betting");const t=team(action.teamId);t.skipped=action.type==="skip_bet";if(t.skipped)t.bet=null;break;}
 case "auto_bet": requirePhase("roulette_betting");for(const t of g.teams)if(t.chips>0&&!t.bet&&!t.skipped)t.bet={color:pick(2,rng)?"red":"black",amount:Math.max(1,Math.floor(t.chips*[0.25,0.5,0.75,1][pick(4,rng)]))};break;
 case "spin": {requirePhase("roulette_betting");if(g.teams.some(t=>t.chips>0&&!t.bet&&!t.skipped))throw new Error("아직 베팅하지 않은 테이블이 있습니다.");const result:SimulationColor=pick(2,rng)?"red":"black";const entries=[];for(const t of g.teams){t.change=0;if(t.bet){const change=t.bet.color===result?t.bet.amount:-t.bet.amount;t.change=change;t.chips+=change;entries.push({id:t.id,table:t.table,name:t.name,color:t.bet.color,amount:t.bet.amount,change,chips:t.chips});}}g.result=result;g.history.push({round:g.round,result,teams:entries});g.rouletteSpinStartedAt=now;g.phase="roulette_result";break;}
 case "next": requirePhase("roulette_result");if(g.rouletteSpinStartedAt!==null&&now<g.rouletteSpinStartedAt+10000)throw new Error("결과 공개를 기다려 주세요.");if(g.round>=g.settings.rouletteSpins||g.teams.every(t=>t.chips===0))g.phase="finished";else{g.round++;g.phase="roulette_betting";g.result=null;g.rouletteSpinStartedAt=null;for(const t of g.teams){t.bet=null;t.skipped=false;}}break;
 }
 return g;
}




