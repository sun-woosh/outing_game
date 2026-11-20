"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/index.ts
var import_node_fs2 = __toESM(require("node:fs"));
var import_node_path2 = __toESM(require("node:path"));
var import_node_http = __toESM(require("node:http"));
var import_express = __toESM(require("express"));
var import_compression = __toESM(require("compression"));
var import_socket = require("socket.io");

// server/game.ts
var import_node_crypto3 = require("node:crypto");

// client/src/lib/roulette-timing.ts
var ROULETTE_SPIN_MS = 8e3;
var ROULETTE_RESULT_HOLD_MS = 2e3;

// client/src/lib/minority-questions.ts
var DEFAULT_PRACTICE_QUESTION = {
  "question": "\uC9C0\uAE08 \uAC00\uC7A5 \uB9C8\uC2DC\uACE0 \uC2F6\uC740 \uC74C\uB8CC\uB294?",
  "options": [
    "\uC544\uC774\uC2A4 \uC544\uBA54\uB9AC\uCE74\uB178",
    "\uCE74\uD398\uB77C\uD14C",
    "\uC624\uB80C\uC9C0\uC8FC\uC2A4",
    "\uD0C4\uC0B0\uC218"
  ]
};
var DOCUMENT_MINORITIES = [
  {
    "question": "\uC57C\uADFC\uC744 \uD558\uACE0 \uC788\uB294\uB370, \uD300\uC6D0\uB4E4\uC774 \uB178\uB3D9\uC694\uB97C \uD2C0\uC790\uACE0 \uD55C\uB2E4. \uAC00\uC7A5 \uD2C0\uACE0 \uC2F6\uC740 \uB178\uB798\uB294?",
    "options": [
      "\uC5D0\uC2A4\uD30C - \uC704\uD50C\uB798\uC26C",
      "\uD3F4\uD0B4 - \uBAA8\uB4E0 \uB0A0 \uBAA8\uB4E0 \uC21C\uAC04",
      "\uC544\uC774\uC720 - \uC88B\uC740 \uB0A0",
      "\uC804\uC18C\uC5F0 - \uD1F4\uC0AC\uD560\uAC8C\uC5EC"
    ]
  },
  {
    "question": "\uAE40\uCEE8\uC124\uD134\uD2B8\uB294 \uC624\uB298\uB3C4 \uC57C\uADFC \uC911\uC774\uB2E4. \uC2DC\uACC4\uB97C \uB531 \uBD24\uB354\uB2C8...\uC9C0\uAE08 \uC2DC\uAC01\uC740?",
    "options": [
      "\uC624\uD6C4 8\uC2DC",
      "\uC624\uD6C4 10\uC2DC",
      "\uC624\uC804 12\uC2DC",
      "\uC624\uC804 2\uC2DC"
    ]
  },
  {
    "question": "\uD504\uB85C\uC81D\uD2B8 \uB9C9\uBC14\uC9C0\uC5D0 \uACBD\uBE44\uAC00 \uB0A8\uC544\uC11C \uD300\uC6D0\uB4E4\uACFC \uC790\uC720\uB86D\uAC8C \uB3C8\uC744 \uC4F0\uB77C\uACE0 \uC9C0\uCE68\uC744 \uBC1B\uC558\uB2E4. \uC6B0\uB9AC \uD300\uC6D0\uC740 \uB098 \uD3EC\uD568 \uCD1D 4\uBA85, \uC608\uC0B0\uC740 100\uB9CC\uC6D0\uC774\uB2E4. \uD300\uC6D0\uB4E4\uACFC \uAC00\uC7A5 \uAC19\uC774 \uD558\uACE0 \uC2F6\uC740 \uD65C\uB3D9\uC740?",
    "options": [
      "\uC81C\uC8FC\uB3C4 \uC5EC\uD589",
      "\uBBA4\uC9C0\uCEEC \uBCF4\uB7EC\uAC00\uAE30",
      "\uACE0\uAE30 \uD30C\uD2F0 \uC220 \uD30C\uD2F0",
      "\uAD6C\uB514 \uBCC4\uBC24\uAC00\uC11C \uC2E0\uB098\uAC8C \uCDA4\uCD94\uAE30"
    ]
  },
  {
    "question": "\uCEE8\uC124\uD134\uD2B8\uB85C\uC11C \uB2E4\uC74C \uC911 \uC81C\uC77C \uB300\uB2E8\uD558\uB2E4 \uC0DD\uAC01\uD558\uB294 \uD300\uC6D0\uC740?",
    "options": [
      "\uB9E4\uC77C \uCD9C\uADFC \uC804 \uD5EC\uC2A4\uC7A5 \uAC00\uB294 \uD300\uC6D0",
      "\uB9E4\uC77C \uC544\uCE68\uC744 \uCC59\uACA8\uBA39\uACE0 \uC624\uB294 \uD300\uC6D0",
      "\uC8FC\uB9D0 \uB0B4\uB0B4 \uC57D\uC18D\uC774 \uD56D\uC0C1 \uAC00\uB4DD\uCC28\uC788\uB294 \uD300\uC6D0",
      "\uD68C\uC2DD \uB2E4\uC74C\uB0A0 \uC544\uBB34\uB807\uC9C0\uB3C4 \uC54A\uAC8C \uCD9C\uADFC\uD574 \uC549\uC544\uC788\uB294 \uD300\uC6D0"
    ]
  },
  {
    "question": "\uC11C\uC6B8 \uC9C0\uD558\uCCA0 1~9\uD638\uC120 \uC911, \uCEE4\uB2C8 \uC0AC\uB78C\uB4E4\uC774 \uC81C\uC77C \uB9CE\uC774 \uAC70\uC8FC\uD558\uB294 \uB178\uC120\uC740?",
    "options": [
      "\uC9C0\uD558\uCCA0 1\uD638\uC120",
      "\uC9C0\uD558\uCCA0 2\uD638\uC120",
      "\uC9C0\uD558\uCCA0 8\uD638\uC120",
      "\uC9C0\uD558\uCCA0 9\uD638\uC120"
    ]
  },
  {
    "question": "\uC624\uB298\uC740 \uB274\uC870\uC774\uB108\uAC00 \uC628 \uB0A0\uC774\uB2E4. \uC544\uC148\uD0C0\uC6CC \uADFC\uCC98\uC5D0\uC11C \uC0C8\uB85C\uC6B4 \uD300\uC6D0\uC744 \uB370\uB9AC\uACE0 \uD300\uC6D0\uB4E4\uACFC \uB2E4\uAC19\uC774 \uAC00\uACE0 \uC2F6\uC740 \uC74C\uC2DD\uC810\uC740?",
    "options": [
      "\uD638\uD638\uC2DD\uB2F9",
      "\uC77C\uC0C1\uC815\uC6D0",
      "\uAD11\uD654\uBB38 \uC11D\uAC08\uBE44",
      "\uD53C\uC5D0\uD504\uCC3D"
    ]
  },
  {
    "question": "\uD788\uC5B4\uB85C \uC601\uD654 \uC18D \uB2A5\uB825 \uC911, \uAC00\uC7A5 \uC2E4\uC81C\uB85C\uB3C4 \uAC00\uB2A5\uD588\uC73C\uBA74 \uD558\uB294 \uCD08\uB2A5\uB825\uC740?",
    "options": [
      "\uC0C1\uB300\uBC29\uC758 \uC18D\uB9C8\uC74C\uC774 \uBAA8\uB450 \uB4E4\uB9AC\uB294 \uD154\uB808\uD30C\uC2DC",
      "\uC5B4\uB514\uB4E0 \uC21C\uC2DD\uAC04\uC5D0 \uC774\uB3D9\uD558\uB294 \uC21C\uAC04\uC774\uB3D9",
      "\uC2DC\uAC04\uC744 5\uBD84 \uC804\uC73C\uB85C \uB418\uB3CC\uB9AC\uB294 \uB2A5\uB825",
      "\uC2E0\uCCB4\uB098 \uC0AC\uBB3C\uC744 \uD22C\uBA85\uD558\uAC8C \uB9CC\uB4DC\uB294 \uC740\uC2E0 \uB2A5\uB825"
    ]
  },
  {
    "question": "\uB0B4\uC77C \uB2F9\uC7A5 \uD734\uAC00\uAC00 \uC8FC\uC5B4\uC9C4\uB2E4\uBA74, \uB098\uC758 \uD734\uAC00 \uACC4\uD68D\uC740?",
    "options": [
      "\uD558\uB8E8 \uC885\uC77C \uC9D1\uC5D0\uC11C \uC554\uB9C9 \uCEE4\uD2BC \uCE58\uACE0 \uB137\uD50C\uB9AD\uC2A4 \uBCF4\uBA70 \uB215\uBC29",
      "\uB2F9\uC77C\uCE58\uAE30\uB85C \uBC14\uB85C \uB5A0\uB098\uB294 \uAC15\uC6D0\uB3C4 \uBC14\uB2E4 \uC5EC\uD589",
      "\uD3C9\uC18C \uAC00\uBCF4\uACE0 \uC2F6\uC5C8\uB358 \uD56B\uD50C\uB808\uC774\uC2A4 \uB9DB\uC9D1/\uCE74\uD398 \uD22C\uC5B4",
      "\uD558\uB8E8 \uC885\uC77C \uC0AC\uC6B0\uB098/\uC2A4\uD30C/\uB9C8\uC0AC\uC9C0 \uBC1B\uC73C\uBA70 \uD790\uB9C1"
    ]
  },
  {
    "question": "\uCCAB PM\uC774 \uB418\uC5C8\uB2E4. \uD504\uB85C\uC81D\uD2B8 Kick-off \uB0A0, PM\uC778 \uB098\uB97C \uAC00\uC7A5 \uC808\uB9DD\uD558\uAC8C \uB9CC\uB4DC\uB294 \uD300\uC6D0\uC758 \uD55C\uB9C8\uB514/\uC0C1\uD0DC\uB294?",
    "options": [
      '"\uC800 \uC7A5\uAE30\uC5F0\uC560 7\uB144 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4..." \uD558\uB8E8 \uC885\uC77C \uD55C\uC228 \uC26C\uB294 \uD300\uC6D0',
      '"\uC9C8\uBB38\uC774 50\uAC1C \uC815\uB3C4 \uC788\uB294\uB370\uC694!" 10\uBD84\uC5D0 \uD55C \uBC88\uC529 \uD551\uD401 \uCE58\uB294 \uC9C8\uBB38\uB9C8\uC655 \uD300\uC6D0',
      "\uC644\uBCBD\uC8FC\uC758\uC790\uB77C \uCCAB \uC7A5 \uC7A5\uD45C \uB514\uC790\uC778\uB9CC 3\uC77C\uC9F8 \uC7A1\uACE0 \uC788\uB294 \uD300\uC6D0",
      '"\uB124 \uC54C\uACA0\uC2B5\uB2C8\uB2E4!" \uB2F5\uC740 \uC81C\uC77C \uC798\uD558\uB294\uB370 \uB9C9\uC0C1 \uC5F4\uC5B4\uBCF4\uBA74 \uD574\uB454 \uAC8C \uC5C6\uB294 \uD300\uC6D0'
    ]
  },
  {
    "question": "\uD300 \uD68C\uC2DD \uC7A5\uC18C\uB97C \uC815\uD560 \uB54C, \uAC00\uC7A5 \uC801\uC740 \uC0AC\uB78C\uC774 \uC120\uD0DD\uD560 \uAC83 \uAC19\uC740 \uC7A5\uC18C\uB294?",
    "options": [
      "\uC9C1\uC811 \uAD6C\uC6CC \uBA39\uC5B4\uC57C \uD558\uC9C0\uB9CC \uC815\uB9D0 \uB9DB\uC788\uB294 \uC6D0\uC870 \uC0BC\uACB9\uC0B4\uC9D1",
      "\uAE54\uB054\uD558\uACE0 \uBD84\uC704\uAE30 \uC88B\uC9C0\uB9CC \uC591\uC774 \uC57D\uAC04 \uC544\uC26C\uC6B4 \uC774\uD0C8\uB9AC\uC548 \uB808\uC2A4\uD1A0\uB791",
      "\uCF54\uC2A4\uB85C \uB098\uC640\uC11C \uB300\uD654\uD558\uAE30 \uC88B\uC740 \uACE0\uAE09 \uC911\uC2DD\uB2F9/\uC77C\uC2DD\uB2F9",
      "\uAC01\uC790 \uCDE8\uD5A5\uB300\uB85C \uACE8\uB77C \uBA39\uC744 \uC218 \uC788\uB294 \uD638\uD154 \uBDD4\uD398"
    ]
  },
  {
    "question": "\uB85C\uB610 1\uB4F1(\uC2E4\uC218\uB839 20\uC5B5)\uC5D0 \uB2F9\uCCA8\uB418\uC5C8\uB2E4. \uB2E4\uC74C \uB0A0 \uB098\uC758 \uD589\uB3D9\uC740?",
    "options": [
      "\uC544\uBB34\uC5D0\uAC8C\uB3C4 \uB9D0\uD558\uC9C0 \uC54A\uACE0 \uD3C9\uC18C\uCC98\uB7FC \uBB35\uBB35\uD788 \uCD9C\uADFC\uD574\uC11C \uC815\uC0C1 \uADFC\uBB34\uD55C\uB2E4",
      "\uCD9C\uADFC\uD558\uC790\uB9C8\uC790 \uC0AC\uC9C1\uC11C \uB358\uC9C0\uACE0 \uACF5\uD56D\uC73C\uB85C \uC9C1\uD589\uD574 \uC138\uACC4\uC77C\uC8FC\uB97C \uB5A0\uB09C\uB2E4",
      "\uCE5C\uD55C \uB3D9\uB8CC\uB4E4\uC5D0\uAC8C\uB9CC \uC2AC\uCA4D \uCEE4\uD53C \uD55C \uC794\uC529 \uB3CC\uB9AC\uBA70 \uC778\uC218\uC778\uACC4 \uACC4\uD68D\uC744 \uC138\uC6B4\uB2E4",
      "\uD68C\uC0AC\uC5D0 \uB2F9\uB2F9\uD788 1\uB144 \uBB34\uAE09 \uD734\uC9C1\uACC4\uB97C \uB0B4\uACE0 \uD55C \uB2EC \uC0B4\uAE30\uB97C \uC54C\uC544\uBCF8\uB2E4"
    ]
  },
  {
    "question": "\uC8FC\uB9D0 \uC544\uCE68, \uB208\uC744 \uB5B4\uB294\uB370 \uCE68\uB300 \uBC16\uC73C\uB85C \uB098\uAC00\uAE30 \uAC00\uC7A5 \uC2EB\uC5B4\uC9C0\uB294 \uCD5C\uC545\uC758 \uB0A0\uC528\uB294?",
    "options": [
      "\uCC3D\uBB38\uC744 \uB54C\uB9AC\uB294 \uD3ED\uC6B0\uC640 \uAC15\uD48D (\uD0DC\uD48D\uAE09 \uB0A0\uC528)",
      "\uD55C \uAC78\uC74C\uB9CC \uAC78\uC5B4\uB3C4 \uB540\uC774 \uC904\uC904 \uD750\uB974\uB294 36\uB3C4 \uD3ED\uC5FC",
      "\uBF08\uAC00 \uC2DC\uB9B4 \uC815\uB3C4\uB85C \uCE7C\uBC14\uB78C\uC774 \uBD80\uB294 \uC601\uD558 15\uB3C4 \uD55C\uD30C",
      "\uD558\uB298\uC774 \uB178\uB797\uACE0 \uBAA9\uC774 \uCE7C\uCE7C\uD574\uC9C0\uB294 \uCD5C\uC545\uC758 \uBBF8\uC138\uBA3C\uC9C0 \uD669\uC0AC"
    ]
  },
  {
    "question": "\uB2E8 \uD55C \uAC00\uC9C0 \uC74C\uC2DD\uB9CC \uD3C9\uC0DD \uC9C8\uB9AC\uC9C0 \uC54A\uACE0 \uBB34\uD55C \uB9AC\uD544\uB41C\uB2E4\uBA74, \uB0B4\uAC00 \uC120\uD0DD\uD560 \uBA54\uB274\uB294?",
    "options": [
      "\uB9E4\uCF64\uB2EC\uCF64\uD55C \uAD6D\uBBFC \uAC04\uC2DD \uB5A1\uBCF6\uC774 & \uD280\uAE40 \uC138\uD2B8",
      "\uAC13 \uD280\uACA8 \uBC14\uC0AD\uD558\uACE0 \uC721\uC999 \uAC00\uB4DD\uD55C \uCE58\uD0A8",
      "\uC5B8\uC81C \uBA39\uC5B4\uB3C4 \uC9C8\uB9AC\uC9C0 \uC54A\uB294 \uC5BC\uD070\uD55C \uAE40\uCE58\uCC0C\uAC1C/\uB41C\uC7A5\uCC0C\uAC1C\uC640 \uC300\uBC25",
      "\uC721\uC999 \uD321\uD321 \uD130\uC9C0\uB294 \uB450\uD23C\uD55C \uC18C\uACE0\uAE30 \uC2A4\uD14C\uC774\uD06C"
    ]
  },
  {
    "question": "\uD63C\uC790\uB9CC\uC758 \uC628\uC804\uD55C \uC8FC\uB9D0 \uC790\uC720\uC2DC\uAC04 4\uC2DC\uAC04\uC774 \uC0DD\uACBC\uB2E4. \uAC00\uC7A5 \uD558\uACE0 \uC2F6\uC740 \uD65C\uB3D9\uC740?",
    "options": [
      "\uD578\uB4DC\uD3F0 \uBE44\uD589\uAE30 \uBAA8\uB4DC \uCF1C\uB450\uACE0 \uB9CC\uD654\uBC29/\uBD81\uCE74\uD398\uC5D0\uC11C \uB4B9\uAD74\uAC70\uB9AC\uAE30",
      "\uC544\uBB34 \uC0DD\uAC01 \uC5C6\uC774 \uC774\uC5B4\uD3F0 \uB07C\uACE0 \uD55C\uAC15\uC774\uB098 \uACF5\uC6D0 \uB7EC\uB2DD/\uC0B0\uCC45\uD558\uAE30",
      "\uD3C9\uC18C \uBC00\uB838\uB358 \uBC29 \uCCAD\uC18C, \uBD84\uB9AC\uC218\uAC70, \uBE68\uB798 \uC2F9 \uB05D\uB0B4\uACE0 \uB514\uD4E8\uC800 \uCF1C\uAE30",
      "\uC870\uC6A9\uD55C \uCE74\uD398 \uAD6C\uC11D\uC5D0 \uC549\uC544 \uBA4D\uB54C\uB9AC\uAC70\uB098 \uB2E4\uC774\uC5B4\uB9AC/\uC77C\uAE30 \uC4F0\uAE30"
    ]
  },
  {
    "question": "\uC2A4\uB9C8\uD2B8\uD3F0 \uC571 \uC911, \uD3C9\uC0DD \uB531 \uD558\uB098\uB9CC \uC9C0\uC6B0\uACE0 \uC0B4\uC544\uC57C \uD55C\uB2E4\uBA74 \uAC00\uC7A5 \uBA3C\uC800 \uC0AD\uC81C\uD560 \uC571\uC740?",
    "options": [
      "\uCE74\uCE74\uC624\uD1A1/\uBA54\uC2E0\uC800 (\uC5F0\uB77D\uC740 \uC624\uC9C1 \uC804\uD654\uC640 \uBB38\uC790\uBA54\uC2DC\uC9C0\uB85C\uB9CC)",
      "\uC720\uD29C\uBE0C (\uC20F\uD3FC, \uC601\uC0C1 \uC2DC\uCCAD \uC804\uBA74 \uAE08\uC9C0)",
      "\uC778\uC2A4\uD0C0\uADF8\uB7A8/SNS (\uD0C0\uC778\uC758 \uC77C\uC0C1 \uAD6C\uACBD \uC601\uAD6C \uC911\uB2E8)",
      "\uBC30\uB2EC\uC758\uBBFC\uC871/\uC694\uAE30\uC694 (\uC678\uC2DD\uC740 \uBB34\uC870\uAC74 \uD3EC\uC7A5 \uC544\uB2C8\uBA74 \uC9C1\uC811 \uC694\uB9AC)"
    ]
  },
  {
    "question": "\uCD5C\uC885 \uBCF4\uACE0 \uC9C1\uC804, \uBC24\uC0D8 \uC791\uC5C5 \uC911 \uC5D1\uC140/PPT\uC5D0\uC11C \uACAA\uB294 \uAC00\uC7A5 \uC544\uCC14\uD55C \uD638\uB7EC\uBE14\uD55C \uC21C\uAC04\uC740?",
    "options": [
      "2\uC2DC\uAC04 \uB3D9\uC548 \uC800\uC7A5 \uC548 \uD588\uB294\uB370 \uD654\uBA74\uC774 \uD558\uC597\uAC8C \uBCC0\uD558\uBA70 '\uC751\uB2F5 \uC5C6\uC74C' \uB730 \uB54C",
      "\uB9C8\uC2A4\uD130 \uC2AC\uB77C\uC774\uB4DC \uD15C\uD50C\uB9BF \uAC74\uB4DC\uB838\uB2E4\uAC00 \uC804\uCCB4 80\uD398\uC774\uC9C0 \uB808\uC774\uC544\uC6C3\uC774 \uB2E4 \uAE68\uC84C\uC744 \uB54C",
      "\uBCF5\uC7A1\uD558\uAC8C \uC5BD\uD78C \uC7AC\uBB34 \uBAA8\uB378\uB9C1 \uC2DC\uD2B8 \uC804\uCCB4\uC5D0 #REF! \uC5D0\uB7EC\uAC00 \uB3C4\uBC30\uB418\uC5C8\uC744 \uB54C",
      "\uD30C\uD2B8\uB108 \uBCF4\uACE0 10\uBD84 \uC804, \uACF5\uC720 \uB4DC\uB77C\uC774\uBE0C\uC5D0\uC11C \uB204\uAD70\uAC00 \uB0B4 \uC791\uC5C5 \uD30C\uC77C\uC744 \uB36E\uC5B4\uC4F0\uAE30 \uD588\uC744 \uB54C"
    ]
  },
  {
    "question": "\uCEE8\uC124\uD134\uD2B8\uC758 \uCD9C\uC7A5 \uAC00\uBC29\uC5D0 '\uB178\uD2B8\uBD81' \uBE7C\uACE0 \uBC18\uB4DC\uC2DC \uB4E4\uC5B4\uAC00\uC57C \uD558\uB294 \uD544\uC218 \uC0DD\uC874 \uC544\uC774\uD15C\uC740?",
    "options": [
      "\uC8FC\uBCC0 \uC18C\uC74C\uC744 \uC644\uBCBD\uD558\uAC8C \uCC28\uB2E8\uD574\uC8FC\uB294 \uB178\uC774\uC988 \uCE94\uC2AC\uB9C1 \uD5E4\uB4DC\uD3F0/\uC774\uC5B4\uD3F0",
      "\uC7A5\uC2DC\uAC04 \uC549\uC544\uC788\uB294 \uD5C8\uB9AC\uC640 \uBAA9\uC744 \uC9C0\uCF1C\uC8FC\uB294 \uD734\uB300\uC6A9 \uAC70\uCE58\uB300 & \uBB34\uC120 \uB9C8\uC6B0\uC2A4",
      "\uD64D\uC0BC, \uBE44\uD0C0\uBBFC, \uBC00\uD06C\uC528\uC2AC \uB4F1 \uD558\uB8E8\uB97C \uBC84\uD2F0\uAC8C \uD574\uC8FC\uB294 \uAC01\uC885 \uC601\uC591\uC81C \uD30C\uC6B0\uCE58",
      "\uC548\uB300, \uADC0\uB9C8\uAC1C, \uBAA9\uBCA0\uAC1C \uB4F1 \uC774\uB3D9 \uC911 10\uBD84 \uAFC0\uC7A0\uC744 \uC704\uD55C \uC219\uBA74 \uD0A4\uD2B8"
    ]
  },
  {
    "question": "\uD504\uB85C\uC81D\uD2B8 \uB8F8(War room) \uAC04\uC2DD \uBC14\uAD6C\uB2C8\uC5D0 \uC0C8\uB85C \uCC44\uC6CC \uB123\uB294\uB2E4\uBA74 \uAC00\uC7A5 \uD658\uC601\uBC1B\uC744 \uAC04\uC2DD\uC740?",
    "options": [
      "\uB1CC\uC5D0 \uC989\uAC01 \uD3EC\uB3C4\uB2F9\uC744 \uB54C\uB824 \uBC15\uC544\uC8FC\uB294 \uCD08\uCF5C\uB9BF/\uBE0C\uB77C\uC6B0\uB2C8\uB958",
      "\uC878\uC74C \uAE70 \uB54C \uC785\uC5D0 \uBB3C\uACE0 \uC539\uAE30 \uC88B\uC740 \uC824\uB9AC/\uC0AC\uD0D5\uB958",
      "\uBC30\uACE0\uD50C \uB54C \uB2E8\uBC31\uC9C8\uACFC \uD3EC\uB9CC\uAC10\uC744 \uCC44\uC6CC\uC8FC\uB294 \uC5D0\uB108\uC9C0\uBC14/\uD504\uB85C\uD2F4\uBC14",
      "\uC9ED\uC9E4\uD574\uC11C \uBA4D\uB54C\uB9B4 \uB54C \uACC4\uC18D \uC190\uC774 \uAC00\uB294 \uAC10\uC790\uCE69/\uB098\uCD08/\uD504\uB808\uCCBC\uB958"
    ]
  },
  {
    "question": "\uC2AC\uB77C\uC774\uB4DC \uC791\uC5C5\uD560 \uB54C, \uC660\uC9C0 \uBAA8\uB974\uAC8C \uADF8\uB0E5 \uB118\uC5B4\uAC00\uAE30 \uD798\uB4E0 \uB098\uB9CC\uC758 \uC0AC\uC18C\uD55C \uC9C1\uC5C5\uBCD1\uC740?",
    "options": [
      "\uB3C4\uD615 \uBC15\uC2A4 \uC88C\uC6B0/\uC0C1\uD558 \uC815\uB82C(Align)\uC774 1pt\uB77C\uB3C4 \uC5B4\uAE0B\uB098 \uC788\uB294 \uAF34\uC744 \uBABB \uBD04",
      "\uD398\uC774\uC9C0\uB9C8\uB2E4 \uD3F0\uD2B8 \uD06C\uAE30\uB098 \uAE00\uAF34\uC774 \uD558\uB098\uB77C\uB3C4 \uB2E4\uB974\uBA74 \uBB34\uC870\uAC74 \uB9DE\uCDB0\uC57C \uD568",
      "\uBD88\uB81B \uD3EC\uC778\uD2B8(\u2022) \uB4A4\uC5D0 \uB744\uC5B4\uC4F0\uAE30 \uD55C \uCE78 \uAC04\uACA9\uC774 \uC81C\uAC01\uAC01\uC778 \uAC8C \uB208\uC5D0 \uBC1F\uD798",
      "\uD45C(Table) \uC548\uC758 \uD14D\uC2A4\uD2B8\uAC00 \uC704\uC544\uB798 \uC815\uC911\uC559\uC5D0 \uC548 \uB9DE\uACE0 \uC0B4\uC9DD \uC3E0\uB824\uC788\uC744 \uB54C"
    ]
  },
  {
    "question": "\uCD9C\uADFC\uD574\uC11C \uC790\uB9AC\uC5D0 \uC549\uC558\uB294\uB370, \uC624\uB298 \uD558\uB8E8\uAC00 \uAC00\uC7A5 \uD53C\uACE4\uD560 \uAC83 \uAC19\uC740 \uBE44\uC0C1\uC0AC\uD0DC\uB294?",
    "options": [
      "\uC5D0\uC5B4\uD31F(\uC774\uC5B4\uD3F0)\uC744 \uC9D1\uC5D0 \uB450\uACE0 \uC640\uC11C \uC0AC\uBB34\uC2E4\uC758 \uBAA8\uB4E0 \uC18C\uC74C\uC774 \uB2E4 \uB4E4\uB9B4 \uB54C",
      "\uB178\uD2B8\uBD81 \uCDA9\uC804\uAE30(\uC5B4\uB311\uD130)\uB97C \uAE5C\uBE61\uD574\uC11C \uBC30\uD130\uB9AC \uC794\uB7C9 30% \uBCF4\uBA70 \uC804\uC804\uAE0D\uAE0D\uD560 \uB54C",
      "\uC81C\uC77C \uC544\uB07C\uB294 \uD770 \uC154\uCE20\uC5D0 \uC544\uCE68 \uCEE4\uD53C\uB97C \uC3DF\uC544\uC11C \uD558\uB8E8 \uC885\uC77C \uC2E0\uACBD \uC4F0\uC77C \uB54C",
      "\uD140\uBE14\uB7EC \uC548 \uCC59\uACA8\uC640\uC11C \uD558\uB8E8 \uC885\uC77C \uC885\uC774\uCEF5 \uC138 \uAC1C\uB85C \uBC84\uD168\uC57C \uD560 \uB54C"
    ]
  }
];

// client/src/lib/minority-result.ts
function countMinorityChoices(optionCount, choices) {
  const counts = Array(optionCount).fill(0);
  for (const choice of choices) {
    if (typeof choice === "number" && Number.isInteger(choice) && choice >= 0 && choice < optionCount) counts[choice]++;
  }
  const selected = counts.filter((count) => count > 0);
  if (selected.length < 2) return { counts, winningChoices: [], outcome: "none" };
  const minimum = Math.min(...selected);
  if (selected.every((count) => count === minimum)) return { counts, winningChoices: [], outcome: "tie" };
  return { counts, winningChoices: counts.flatMap((count, index) => count === minimum ? [index] : []), outcome: "minority" };
}

// server/face.ts
var import_node_crypto = require("node:crypto");
var defaultFaceSettings = { facePeople: [], faceMatchBonus: 100, faceNameBonus: 50, faceSelectSeconds: 30, faceNameSeconds: 30 };
var FACE_MISMATCH_MS = 3e3;
var FACE_NAME_RESULT_MS = 5e3;
var FaceError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
  status;
};
var fail = (message, status = 400) => {
  throw new FaceError(message, status);
};
var readyPeople = (settings) => (settings.facePeople || []).filter((p) => p.name.trim() && p.photo);
var faceEnabled = (settings) => readyPeople(settings).length >= 2;
var normalize = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[\s.·\-_]/g, "");
var nameMatches = (answer, person) => [person.name, ...person.aliases || []].some((n) => n && normalize(n) === normalize(answer));
function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = import_node_crypto.webcrypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
var uuid = () => import_node_crypto.webcrypto.randomUUID();
var currentTeam = (room) => {
  const f = room.face;
  return room.teams.find((t) => t.id === f.order[f.turnIndex]);
};
function award(room, teamId, amount) {
  const team = room.teams.find((t) => t.id === teamId);
  if (!team || amount <= 0) return;
  team.chips += amount;
  team.faceChange = (team.faceChange ?? 0) + amount;
}
function startTurn(room, now) {
  const f = room.face;
  f.stage = "select";
  f.selected = [];
  f.answers = {};
  f.result = null;
  f.turnId = uuid();
  f.deadline = now + room.settings.faceSelectSeconds * 1e3;
}
function nextTurn(room, now) {
  const f = room.face;
  if (f.stopAfterTurn || f.removed.length * 2 >= f.board.length) return finishFace(room);
  f.order = f.order.filter((id) => room.teams.some((t) => t.id === id));
  if (!f.order.length) return finishFace(room);
  f.turnIndex = (f.turnIndex + 1) % f.order.length;
  startTurn(room, now);
}
function finishFace(room) {
  const f = room.face;
  f.stage = "done";
  f.deadline = null;
  f.selected = [];
  room.phase = "face_result";
}
function judge(room, now) {
  const f = room.face;
  const [a, b] = f.selected;
  if (f.board[a] === f.board[b]) {
    award(room, f.order[f.turnIndex], room.settings.faceMatchBonus);
    f.stage = "name";
    f.answers = {};
    f.deadline = now + room.settings.faceNameSeconds * 1e3;
  } else {
    f.stage = "mismatch";
    f.deadline = now + FACE_MISMATCH_MS;
  }
}
function autoPick(room, now) {
  const f = room.face;
  const open = f.board.map((_, i) => i).filter((i) => !f.removed.includes(f.board[i]) && !f.selected.includes(i));
  while (f.selected.length < 2 && open.length) f.selected.push(open.splice(import_node_crypto.webcrypto.getRandomValues(new Uint32Array(1))[0] % open.length, 1)[0]);
  judge(room, now);
}
function gradeName(room, now) {
  const f = room.face;
  const personId = f.board[f.selected[0]];
  const person = room.settings.facePeople.find((p) => p.id === personId);
  const winners = Object.entries(f.answers).filter(([, answer]) => nameMatches(answer, person)).map(([teamId]) => teamId);
  for (const teamId of winners) award(room, teamId, room.settings.faceNameBonus);
  f.removed.push(personId);
  f.result = { personId, name: person.name, attackerId: f.order[f.turnIndex], winners, answers: { ...f.answers } };
  f.history.push({ personId, name: person.name, attackerId: f.result.attackerId, winners });
  f.stage = "name_result";
  f.deadline = now + FACE_NAME_RESULT_MS;
}
function reconcileFace(room, now = Date.now()) {
  const f = room.face;
  if (room.phase !== "face_play" || !f || !f.deadline || now < f.deadline) return false;
  if (f.stage === "select") autoPick(room, now);
  else if (f.stage === "mismatch" || f.stage === "name_result") nextTurn(room, now);
  else if (f.stage === "name") gradeName(room, now);
  else return false;
  return true;
}
function startFaceTutorial(room) {
  if (room.phase !== "lobby") fail("\uB300\uAE30\uC2E4\uC5D0\uC11C\uB9CC \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  if (!room.teams.length) fail("\uCC38\uC5EC\uD55C \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (!faceEnabled(room.settings)) fail("\uC5BC\uAD74 \uCE74\uB4DC\uC5D0 \uC4F8 \uC0AC\uB78C\uC744 2\uBA85 \uC774\uC0C1(\uC774\uB984\uACFC \uC0AC\uC9C4) \uB4F1\uB85D\uD574 \uC8FC\uC138\uC694.");
  for (const team of room.teams) {
    team.chips = 0;
    team.faceChange = 0;
  }
  room.face = null;
  room.phase = "face_tutorial";
}
function startFaceGame(room, now = Date.now()) {
  if (room.phase !== "face_tutorial") fail("\uC5BC\uAD74 \uCE74\uB4DC \uC548\uB0B4 \uD654\uBA74\uC5D0\uC11C \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
  if (!room.teams.length) fail("\uCC38\uC5EC\uD55C \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const people = readyPeople(room.settings);
  if (people.length < 2) fail("\uC5BC\uAD74 \uCE74\uB4DC\uC5D0 \uC4F8 \uC0AC\uB78C\uC744 2\uBA85 \uC774\uC0C1 \uB4F1\uB85D\uD574 \uC8FC\uC138\uC694.");
  room.face = {
    stage: "select",
    board: shuffle(people.flatMap((p) => [p.id, p.id])),
    selected: [],
    removed: [],
    order: [...room.teams].sort((a, b) => a.table - b.table).map((t) => t.id),
    turnIndex: 0,
    turnId: "",
    deadline: null,
    answers: {},
    result: null,
    stopAfterTurn: false,
    history: []
  };
  room.phase = "face_play";
  startTurn(room, now);
}
function closeFaceStage(room, turnId, now = Date.now()) {
  const f = room.face;
  if (room.phase !== "face_play" || !f) fail("\uC5BC\uAD74 \uCE74\uB4DC \uC9C4\uD589 \uC911\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
  if (turnId !== void 0 && turnId !== f.turnId) fail("\uC774\uBBF8 \uB2E4\uC74C \uCC28\uB840\uB85C \uB118\uC5B4\uAC14\uC2B5\uB2C8\uB2E4. \uD654\uBA74\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 409);
  f.deadline = now;
  reconcileFace(room, now);
}
function stopFaceAfterTurn(room) {
  if (room.phase !== "face_play" || !room.face) fail("\uC5BC\uAD74 \uCE74\uB4DC \uC9C4\uD589 \uC911\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
  room.face.stopAfterTurn = !room.face.stopAfterTurn;
}
function facePick(room, teamId, index, turnId, now = Date.now()) {
  const f = room.face;
  if (room.phase !== "face_play" || !f || f.stage !== "select") fail("\uC9C0\uAE08\uC740 \uCE74\uB4DC\uB97C \uACE0\uB97C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (turnId !== f.turnId) fail("\uC774\uBBF8 \uB2E4\uC74C \uCC28\uB840\uB85C \uB118\uC5B4\uAC14\uC2B5\uB2C8\uB2E4.", 409);
  if (currentTeam(room)?.id !== teamId) fail("\uC9C0\uAE08\uC740 \uB2E4\uB978 \uD14C\uC774\uBE14 \uCC28\uB840\uC785\uB2C8\uB2E4.");
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= f.board.length || f.selected.includes(i) || f.removed.includes(f.board[i])) fail("\uACE0\uB97C \uC218 \uC5C6\uB294 \uCE74\uB4DC\uC785\uB2C8\uB2E4.");
  f.selected.push(i);
  if (f.selected.length === 2) judge(room, now);
}
function faceAnswer(room, teamId, answer, turnId, now = Date.now()) {
  const f = room.face;
  if (f && f.stage === "name_result" && turnId === f.turnId) fail("\uBAA8\uB4E0 \uD14C\uC774\uBE14\uC774 \uC81C\uCD9C\uD574\uC11C \uC774\uBBF8 \uCC44\uC810\uC774 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4.", 409);
  if (room.phase !== "face_play" || !f || f.stage !== "name") fail("\uC9C0\uAE08\uC740 \uC774\uB984\uC744 \uC81C\uCD9C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (turnId !== f.turnId) fail("\uC774\uBBF8 \uB2E4\uC74C \uCC28\uB840\uB85C \uB118\uC5B4\uAC14\uC2B5\uB2C8\uB2E4.", 409);
  if (typeof answer !== "string" || !answer.trim() || answer.length > 40) fail("\uC774\uB984\uC744 40\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  f.answers[teamId] = answer.trim();
  if (room.teams.every((t) => f.answers[t.id] !== void 0)) gradeName(room, now);
}
function facePublic(room, myTeamId, isHost) {
  const f = room.face;
  const people = room.settings.facePeople || [];
  const photoOf = (id) => people.find((p) => p.id === id)?.photo ?? null;
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? "";
  if (!f) return null;
  return {
    stage: f.stage,
    turnId: f.turnId,
    deadline: f.deadline,
    currentTeamId: f.stage === "done" ? null : f.order[f.turnIndex] ?? null,
    nextTeamId: f.stage === "done" || !f.order.length ? null : f.order[(f.turnIndex + 1) % f.order.length],
    order: f.order,
    pairs: f.board.length / 2,
    found: f.removed.length,
    stopAfterTurn: f.stopAfterTurn,
    // 카드: 뒤집힌 카드와 이미 찾은 카드만 사진 공개. 이름은 정답 공개 후에만
    board: f.board.map((id, index) => {
      const removed = f.removed.includes(id);
      const open = f.selected.includes(index);
      return { index, open, removed, photo: open || removed ? photoOf(id) : null, name: removed ? nameOf(id) : null };
    }),
    submitted: Object.keys(f.answers),
    myAnswer: myTeamId ? f.answers[myTeamId] ?? null : null,
    // 운영자는 진행 중에도 정답과 제출 답안을 볼 수 있음
    hostAnswer: isHost && f.stage === "name" ? nameOf(f.board[f.selected[0]]) : null,
    hostAnswers: isHost ? f.answers : null,
    result: f.result ? { ...f.result, answers: isHost ? f.result.answers : myTeamId && f.result.answers[myTeamId] !== void 0 ? { [myTeamId]: f.result.answers[myTeamId] } : {} } : null,
    history: f.history
  };
}
function validateFacePeople(value, photoExists2) {
  if (!Array.isArray(value) || value.length > 40) fail("\uC5BC\uAD74 \uCE74\uB4DC \uC778\uBB3C\uC740 \uCD5C\uB300 40\uBA85\uAE4C\uC9C0 \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  const seen = /* @__PURE__ */ new Set();
  return value.map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (name.length > 30) fail(`${index + 1}\uBC88\uC9F8 \uC778\uBB3C\uC758 \uC774\uB984\uC774 \uB108\uBB34 \uAE41\uB2C8\uB2E4.`);
    const aliases = Array.isArray(item.aliases) ? item.aliases.filter((a) => typeof a === "string").map((a) => a.trim()).filter(Boolean).slice(0, 5) : [];
    const photo = typeof item.photo === "string" && photoExists2(item.photo) ? item.photo : null;
    let id = typeof item.id === "string" && /^[a-z0-9-]{4,40}$/.test(item.id) ? item.id : uuid();
    if (seen.has(id)) id = uuid();
    seen.add(id);
    return { id, name, aliases, photo };
  });
}

// server/photos.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var import_node_crypto2 = require("node:crypto");
var photos = /* @__PURE__ */ new Map();
var dir = "";
var EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
var MAX_PHOTO_BYTES = 15e5;
function initPhotos(dataDir) {
  dir = import_node_path.default.join(dataDir, "photos");
  try {
    import_node_fs.default.mkdirSync(dir, { recursive: true });
    for (const file of import_node_fs.default.readdirSync(dir)) {
      const m = /^([a-f0-9-]{36})\.(jpg|png|webp)$/.exec(file);
      if (!m) continue;
      const mime = Object.keys(EXT).find((k) => EXT[k] === m[2]);
      photos.set(m[1], { mime, data: import_node_fs.default.readFileSync(import_node_path.default.join(dir, file)) });
    }
  } catch (e) {
    console.error("[photos] \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328:", e.message);
  }
}
var photoExists = (id) => photos.has(id);
var getPhoto = (id) => photos.get(id) ?? null;
function savePhotoDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const data = Buffer.from(m[2], "base64");
  if (!data.length || data.length > MAX_PHOTO_BYTES) return null;
  const sig = data.subarray(0, 12).toString("hex");
  const ok = m[1] === "image/jpeg" && sig.startsWith("ffd8ff") || m[1] === "image/png" && sig.startsWith("89504e47") || m[1] === "image/webp" && data.subarray(8, 12).toString() === "WEBP";
  if (!ok) return null;
  const id = import_node_crypto2.webcrypto.randomUUID();
  photos.set(id, { mime: m[1], data });
  if (dir) import_node_fs.default.writeFile(import_node_path.default.join(dir, `${id}.${EXT[m[1]]}`), data, (err) => {
    if (err) console.error("[photos] \uC800\uC7A5 \uC2E4\uD328", err.message);
  });
  return id;
}
function photoDataUrl(id) {
  const p = photos.get(id);
  return p ? `data:${p.mime};base64,${p.data.toString("base64")}` : null;
}

// server/game.ts
var env = {
  get GAME_HOST_PASSWORD() {
    return process.env.GAME_HOST_PASSWORD || process.env.HOST_PIN || "";
  }
};
var MINORITY_QUESTION_SET_VERSION = 1;
var defaultSettings = { tableCount: 14, initialChips: 0, blackjackBonus: 100, blackjackPenalty: 50, blackjackRounds: 1, rouletteSpins: 3, minorityRounds: DOCUMENT_MINORITIES.length, minorityBonus: 100, minorityPracticeQuestion: DEFAULT_PRACTICE_QUESTION, minorityQuestions: DOCUMENT_MINORITIES, ...defaultFaceSettings };
function migrateMinorityQuestions(room) {
  if ((room.minorityQuestionSetVersion ?? 0) >= MINORITY_QUESTION_SET_VERSION) return false;
  room.settings = { ...room.settings, minorityPracticeQuestion: DEFAULT_PRACTICE_QUESTION, minorityQuestions: DOCUMENT_MINORITIES, minorityRounds: DOCUMENT_MINORITIES.length };
  room.minorityQuestionSetVersion = MINORITY_QUESTION_SET_VERSION;
  return true;
}
function migrateZeroStart(room) {
  if (room.zeroStartVersion === 1) return false;
  room.settings.initialChips = 0;
  for (const team of room.teams) team.chips = 0;
  room.zeroStartVersion = 1;
  return true;
}
function json(value, status = 200) {
  return { status, body: value };
}
var store = { activeRoom: null, rooms: {} };
var onChange = () => {
};
function setChangeListener(fn) {
  onChange = fn;
}
function exportStore() {
  return JSON.stringify(store);
}
function importStore(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || typeof data.rooms !== "object") return;
  store.activeRoom = data.activeRoom ?? null;
  store.rooms = data.rooms;
}
function pruneRooms() {
  const codes = Object.keys(store.rooms).filter((code) => code !== store.activeRoom);
  for (const code of codes.slice(0, Math.max(0, codes.length - 3))) delete store.rooms[code];
}
var GameError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
  status;
};
function fail2(message, status = 400) {
  throw new GameError(message, status);
}
function token() {
  return Array.from(import_node_crypto3.webcrypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(import_node_crypto3.webcrypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b & 31]).join("");
}
var ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var suits = ["\u2660", "\u2665", "\u2666", "\u2663"];
function card() {
  let b;
  do {
    b = import_node_crypto3.webcrypto.getRandomValues(new Uint8Array(1))[0];
  } while (b >= 208);
  const index = b % 52;
  return { rank: ranks[index % ranks.length], suit: suits[Math.floor(index / ranks.length)] };
}
function codeOf(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z2-9]{6}$/.test(code)) fail2("\uBC29 \uCF54\uB4DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  return code;
}
function str(value) {
  return typeof value === "string" ? value : "";
}
function validateMinorityQuestion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail2("\uC9C8\uBB38\uACFC \uC120\uD0DD\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  const item = value;
  if (typeof item.question !== "string" || !item.question.trim() || item.question.trim().length > 120 || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6 || item.options.some((option) => typeof option !== "string" || !option.trim() || option.trim().length > 80)) fail2("\uC9C8\uBB38\uACFC 2~6\uAC1C\uC758 \uC120\uD0DD\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  return { question: item.question.trim(), options: item.options.map((option) => option.trim()) };
}
function total(team) {
  return team.cards.reduce((sum, card2) => sum + (typeof card2 === "number" ? card2 : card2.rank === "A" ? 1 : ["J", "Q", "K"].includes(card2.rank) ? 10 : Number(card2.rank)), 0);
}
async function activeRoom() {
  return store.activeRoom;
}
var hostTokenCache = null;
async function hostTokenForPassword() {
  const password = env.GAME_HOST_PASSWORD;
  if (hostTokenCache && hostTokenCache.password === password) return hostTokenCache.token;
  if (!password) fail2("\uC6B4\uC601\uC790 \uBE44\uBC00\uBC88\uD638\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.", 503);
  const encoder = new TextEncoder();
  const key = await import_node_crypto3.webcrypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await import_node_crypto3.webcrypto.subtle.sign("HMAC", key, encoder.encode("dt-outing-host-session-v1"));
  const result = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
  hostTokenCache = { password, token: result };
  return result;
}
function publicState(room, teamToken = "", isHost = false) {
  const myTeam = room.teams.find((team) => team.token === teamToken && teamToken);
  const questionIndex = !room.minorityPractice && (room.phase === "minority_play" || room.phase === "minority_result") ? (room.minorityRound ?? 1) - 1 : -1;
  const questions = isHost ? room.settings.minorityQuestions : questionIndex >= 0 && questionIndex < room.settings.minorityQuestions.length ? Array.from({ length: questionIndex + 1 }, (_, index) => index === questionIndex ? room.settings.minorityQuestions[index] : null) : [];
  return {
    room: room.room,
    stage: room.phase.startsWith("roulette_") || room.phase === "finished" ? 2 : 1,
    // 얼굴 카드를 하면 1·2·3라운드, 안 하면 소수의 선택 1라운드 · 룰렛 2라운드
    rounds: faceUsed(room) ? { face: 1, minority: 2, roulette: 3 } : { face: null, minority: 1, roulette: 2 },
    face: facePublic(room, myTeam?.id ?? null, isHost),
    // 얼굴 카드 인물 이름·사진은 운영자에게만 (참가자에게는 인원수만)
    round: room.round,
    phase: room.phase,
    result: room.result,
    settings: isHost ? room.settings : { ...room.settings, minorityQuestions: questions, facePeople: [], facePeopleCount: readyPeople(room.settings).length },
    excludedTables: room.excludedTables,
    blackjackDeadline: room.blackjackDeadline ?? null,
    blackjackRound: room.blackjackRound ?? 1,
    blackjackPractice: room.blackjackPractice === true,
    blackjackResultAt: room.blackjackResultAt ?? null,
    blackjackHistory: isHost ? room.blackjackHistory ?? [] : [],
    minorityRound: room.minorityRound ?? 1,
    minorityPractice: room.minorityPractice === true,
    minorityDeadline: room.minorityDeadline ?? null,
    minorityResultAt: room.minorityResultAt ?? null,
    minorityResult: room.minorityResult ?? null,
    minorityHistory: isHost ? room.minorityHistory ?? [] : [],
    rouletteSpinStartedAt: room.rouletteSpinStartedAt ?? null,
    serverTime: Date.now(),
    teams: room.teams.map((team) => {
      const isMine = team.id === myTeam?.id;
      const hideCards = room.phase === "blackjack_play" && !isMine && !isHost;
      const hideBet = room.phase === "roulette_betting" && !isMine;
      return {
        id: team.id,
        table: team.table,
        name: team.name,
        chips: team.chips,
        practiceChips: room.blackjackPractice && room.phase === "blackjack_result" ? team.chips + (team.blackjackChange ?? 0) : null,
        cards: hideCards ? [] : team.cards,
        total: hideCards || team.cards.length === 0 ? null : total(team),
        blackjackStatus: team.blackjackStatus,
        blackjackChange: team.blackjackChange,
        skipped: team.skipped === true,
        minorityChoice: room.phase === "minority_play" && !isMine ? null : team.minorityChoice ?? null,
        minoritySubmitted: typeof team.minorityChoice === "number",
        minorityChange: team.minorityChange ?? null,
        faceChange: team.faceChange ?? 0,
        bet: !team.bet ? null : hideBet ? { placed: true } : { placed: true, ...team.bet }
      };
    }),
    history: isHost ? room.history : room.history.filter((entry) => entry.round === room.round),
    myTeamId: myTeam?.id ?? null
  };
}
async function load(code) {
  const stored = store.rooms[code];
  if (!stored) fail2("\uBC29\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uBC29 \uCF54\uB4DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 404);
  const row = { revision: 0, data: "" };
  const room = stored;
  if (room.version !== 2) fail2("\uC774\uC804 \uBC84\uC804\uC758 \uAC8C\uC784\uBC29\uC785\uB2C8\uB2E4. \uC6B4\uC601\uC790\uAC00 \uC0C8 \uBC29\uC744 \uB9CC\uB4E4\uC5B4 \uC8FC\uC138\uC694.", 409);
  room.settings = { ...defaultSettings, ...room.settings || {} };
  const migratedQuestions = room.phase === "lobby" && migrateMinorityQuestions(room);
  const migratedStart = room.phase === "lobby" && migrateZeroStart(room);
  const migrated = migratedQuestions || migratedStart;
  room.excludedTables = Array.isArray(room.excludedTables) ? [...new Set(room.excludedTables.filter((n) => Number.isInteger(n) && n >= 1 && n <= room.settings.tableCount))].sort((a, b) => a - b) : [];
  return { row, room, migrated };
}
function blackjackExpired(room, now = Date.now()) {
  return room.phase === "blackjack_play" && typeof room.blackjackDeadline === "number" && Number.isFinite(room.blackjackDeadline) && now >= room.blackjackDeadline && room.teams.some((team) => team.blackjackStatus === "playing");
}
function blackjackReady(room) {
  return room.phase === "blackjack_play" && room.teams.length > 0 && !room.teams.some((team) => team.blackjackStatus === "playing");
}
function blackjackResultReady(room, now = Date.now()) {
  return room.phase === "blackjack_result" && !room.blackjackPractice && (room.blackjackRound ?? 1) < room.settings.blackjackRounds && typeof room.blackjackResultAt === "number" && now >= room.blackjackResultAt + 5e3;
}
function dealBlackjack(room) {
  for (const team of room.teams) {
    team.cards = [card(), card()];
    team.blackjackStatus = "playing";
    team.blackjackChange = null;
  }
  room.blackjackDeadline = Date.now() + 3e4;
  room.blackjackResultAt = null;
  room.phase = "blackjack_play";
}
function startMinorityQuestion(room) {
  for (const team of room.teams) {
    team.minorityChoice = null;
    team.minorityChange = null;
  }
  room.minorityResult = null;
  room.minorityResultAt = null;
  room.minorityDeadline = Date.now() + 3e4;
  room.phase = "minority_play";
}
function faceUsed(room) {
  return !!room.face || room.phase.startsWith("face_") || room.phase === "lobby" && faceEnabled(room.settings);
}
function reconcileAll(room) {
  const a = reconcileBlackjack(room);
  const b = reconcileFace(room);
  return a || b;
}
function reconcileBlackjack(room) {
  if (blackjackResultReady(room)) {
    room.blackjackRound = (room.blackjackRound ?? 1) + 1;
    dealBlackjack(room);
    return true;
  }
  let changed = false;
  if (blackjackExpired(room)) {
    for (const team of room.teams) if (team.blackjackStatus === "playing") team.blackjackStatus = "stand";
    changed = true;
  }
  if (!blackjackReady(room)) return changed;
  const valid = room.teams.filter((team) => team.blackjackStatus !== "bust");
  const best = valid.length ? Math.max(...valid.map(total)) : null;
  for (const team of room.teams) {
    const change = team.blackjackStatus === "bust" ? -Math.min(room.settings.blackjackPenalty, Math.max(0, team.chips - 1)) : total(team) === best ? room.settings.blackjackBonus : 0;
    team.blackjackChange = change;
    if (!room.blackjackPractice) team.chips += change;
  }
  room.blackjackResultAt = Date.now();
  if (!room.blackjackPractice) (room.blackjackHistory ??= []).push({ round: room.blackjackRound ?? 1, teams: room.teams.map((team) => ({ id: team.id, table: team.table, name: team.name, cards: [...team.cards], total: total(team), status: team.blackjackStatus, change: team.blackjackChange ?? 0, chips: team.chips })) });
  room.phase = "blackjack_result";
  return true;
}
async function mutate(code, operation) {
  if (store.activeRoom !== code) fail2("\uC9C4\uD589 \uC911\uC778 \uAC8C\uC784\uC774 \uBCC0\uACBD\uB410\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC785\uC7A5\uD574 \uC8FC\uC138\uC694.", 409);
  const { room } = await load(code);
  const reconciled = reconcileAll(room);
  const snapshot = structuredClone(room);
  try {
    operation(room);
    reconcileAll(room);
  } catch (caught) {
    store.rooms[code] = snapshot;
    if (reconciled) onChange();
    throw caught;
  }
  store.rooms[code] = room;
  onChange();
  return room;
}
async function loadCurrent(code) {
  const { room, migrated } = await load(code);
  const transitioned = reconcileAll(room);
  if (transitioned || migrated) onChange();
  return room;
}
function tick() {
  const code = store.activeRoom;
  const room = code ? store.rooms[code] : null;
  if (!room) return false;
  if (reconcileAll(room)) {
    onChange();
    return true;
  }
  return false;
}
function activeRoomData() {
  return store.activeRoom ? store.rooms[store.activeRoom] ?? null : null;
}
function requireHost(credential, expected) {
  if (!credential || credential !== expected) fail2("\uC6B4\uC601\uC790 \uAD8C\uD55C\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 403);
}
function requireTeam(room, credential) {
  const value = str(credential);
  const team = room.teams.find((t) => value && t.token === value);
  if (!team) fail2("\uD14C\uC774\uBE14 \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 403);
  return team;
}
function requireBlackjackRound(room, value) {
  if ((room.settings.blackjackRounds > 1 || room.blackjackPracticePlayed) && value === void 0 || value !== void 0 && value !== (room.blackjackRound ?? 1)) {
    fail2("\uBE14\uB799\uC7AD \uD134\uC774 \uBCC0\uACBD\uB418\uC5C8\uAC70\uB098 \uD654\uBA74\uC774 \uC624\uB798\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.", 409);
  }
}
function handleError(error) {
  if (error instanceof FaceError) return json({ error: error.message }, error.status);
  if (error instanceof GameError) return json({ error: error.message }, error.status);
  console.error("Game API error", error);
  return json({ error: "\uAC8C\uC784\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." }, 500);
}
async function GET(params) {
  try {
    const code = params.active ? await activeRoom() : codeOf(params.room);
    if (!code) return json({ state: null });
    const room = await loadCurrent(code);
    const hostCredential = params.hostToken ?? null;
    if (hostCredential !== null) requireHost(hostCredential, await hostTokenForPassword());
    return json({ state: publicState(room, params.teamToken ?? "", hostCredential !== null) });
  } catch (error) {
    return handleError(error);
  }
}
async function POST(input) {
  try {
    const body = input;
    if (!body || typeof body !== "object" || Array.isArray(body)) fail2("\uC694\uCCAD\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const action = str(body.action);
    if (action === "host_login") {
      if (!env.GAME_HOST_PASSWORD) fail2("\uC6B4\uC601\uC790 \uBE44\uBC00\uBC88\uD638\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.", 503);
      if (typeof body.password !== "string" || body.password !== env.GAME_HOST_PASSWORD) fail2("\uBE44\uBC00\uBC88\uD638\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 403);
      const hostToken = await hostTokenForPassword();
      const code2 = await activeRoom();
      const game = code2 ? await loadCurrent(code2) : null;
      return json({ room: code2, hostToken, state: game ? publicState(game, "", true) : null });
    }
    if (action === "create") {
      const hostToken = await hostTokenForPassword();
      requireHost(body.hostToken, hostToken);
      {
        const priorCode = await activeRoom();
        const prior = priorCode && store.rooms[priorCode] ? structuredClone(store.rooms[priorCode]) : null;
        if (prior) prior.settings = { ...defaultSettings, ...prior.settings || {} };
        if (prior && (prior.minorityQuestionSetVersion ?? 0) < MINORITY_QUESTION_SET_VERSION) migrateMinorityQuestions(prior);
        const settings = { ...prior ? prior.settings : defaultSettings, initialChips: 0 };
        const excludedTables = prior ? [...prior.excludedTables || []] : [];
        let code2 = randomCode();
        while (store.rooms[code2]) code2 = randomCode();
        const room = { version: 2, room: code2, hostToken: token(), round: 1, phase: "lobby", result: null, settings, excludedTables, teams: [], history: [], minorityQuestionSetVersion: MINORITY_QUESTION_SET_VERSION, zeroStartVersion: 1 };
        store.rooms[code2] = room;
        store.activeRoom = code2;
        pruneRooms();
        onChange();
        return json({ room: code2, hostToken, state: publicState(room, "", true) });
      }
      return fail2("\uBC29\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 503);
    }
    const code = body.room ? codeOf(body.room) : await activeRoom();
    if (!code) fail2("\uC9C4\uD589 \uC911\uC778 \uAC8C\uC784\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC6B4\uC601\uC790\uB97C \uAE30\uB2E4\uB824 \uC8FC\uC138\uC694.", 404);
    const hostActions = ["face_set_people", "start_face", "start_face_game", "face_close", "face_stop", "update_settings", "exclude_table", "include_table", "remove_team", "force_stand", "skip_bet", "undo_skip", "start_blackjack", "start_blackjack_practice", "start_blackjack_game", "settle_blackjack", "start_minority", "start_minority_practice", "start_minority_game", "reveal_minority", "next_minority", "start_roulette", "start_roulette_game", "spin", "next", "finish_no_chips"];
    const expectedHostToken = hostActions.includes(action) ? await hostTokenForPassword() : "";
    if (action === "join") {
      const table = Number(body.table);
      if (!Number.isInteger(table) || table < 1 || table > 30) fail2("\uD14C\uC774\uBE14 \uBC88\uD638\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      let teamToken = token();
      const id = import_node_crypto3.webcrypto.randomUUID();
      const room = await mutate(code, (game) => {
        if (table > game.settings.tableCount) fail2(`\uD14C\uC774\uBE14 \uBC88\uD638 1~${game.settings.tableCount}\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.`);
        if (game.excludedTables.includes(table)) fail2("\uCC38\uC5EC \uB300\uC0C1\uC5D0\uC11C \uC81C\uC678\uB41C \uD14C\uC774\uBE14\uC785\uB2C8\uB2E4. \uC6B4\uC601\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.");
        const existing = game.teams.find((team) => team.table === table);
        if (existing) {
          teamToken = existing.token;
          return;
        }
        if (game.phase !== "lobby") fail2("\uAC8C\uC784\uC774 \uC2DC\uC791\uB418\uC5B4 \uC0C8\uB85C\uC6B4 \uD14C\uC774\uBE14\uC740 \uCC38\uC5EC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        game.teams.push({ id, table, name: `${table}\uBC88 \uD14C\uC774\uBE14`, token: teamToken, chips: game.settings.initialChips, cards: [], blackjackStatus: "waiting", blackjackChange: null, bet: null, skipped: false });
      });
      return json({ teamToken, state: publicState(room, teamToken) });
    }
    if (action === "update_settings") {
      const input2 = body.settings;
      if (!input2 || typeof input2 !== "object" || Array.isArray(input2)) fail2("\uAC8C\uC784 \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      const data = input2;
      const keys = ["tableCount", "initialChips", "blackjackBonus", "blackjackPenalty", "blackjackRounds", "rouletteSpins"];
      const hasBlackjackRounds = data.blackjackRounds !== void 0;
      if (data.blackjackRounds === void 0) data.blackjackRounds = 1;
      if (keys.some((key) => !Number.isSafeInteger(data[key]))) fail2("\uAC8C\uC784 \uC124\uC815\uC740 \uC815\uC218\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      const settings = Object.fromEntries(keys.map((key) => [key, data[key]]));
      if (settings.tableCount < 1 || settings.tableCount > 30) fail2("\uD14C\uC774\uBE14 \uC218\uB294 1~30\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      if (settings.initialChips < 0 || settings.initialChips > 1e5) fail2("\uC2DC\uC791 \uCE69\uC740 0~100000\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      settings.initialChips = 0;
      if (settings.blackjackBonus < 0 || settings.blackjackBonus > 1e5) fail2("\uC6B0\uC2B9 \uBCF4\uB108\uC2A4\uB294 0~100000\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      if (settings.blackjackPenalty < 0 || settings.blackjackPenalty > 1e5) fail2("\uCD08\uACFC \uCC28\uAC10 \uCE69\uC740 0~100000\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      if (settings.blackjackRounds < 1 || settings.blackjackRounds > 20) fail2("\uBE14\uB799\uC7AD \uD134 \uC218\uB294 1~20\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      if (settings.rouletteSpins < 1 || settings.rouletteSpins > 20) fail2("\uB8F0\uB81B \uD69F\uC218\uB294 1~20\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      const minorityBonus = data.minorityBonus;
      if (minorityBonus !== void 0 && (!Number.isSafeInteger(minorityBonus) || minorityBonus < 0 || minorityBonus > 1e5)) fail2("\uC18C\uC218 \uC120\uD0DD \uBCF4\uB108\uC2A4\uB294 0~100000\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      let minorityQuestions;
      if (data.minorityQuestions !== void 0) {
        if (!Array.isArray(data.minorityQuestions) || data.minorityQuestions.length < 1 || data.minorityQuestions.length > 20) fail2("\uC18C\uC218\uC758 \uC120\uD0DD \uBB38\uD56D\uC740 1~20\uAC1C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
        minorityQuestions = data.minorityQuestions.map(validateMinorityQuestion);
      }
      const minorityPracticeQuestion = data.minorityPracticeQuestion === void 0 ? void 0 : validateMinorityQuestion(data.minorityPracticeQuestion);
      const faceNumber = (key, min, max, label) => {
        const v = data[key];
        if (v === void 0) return void 0;
        if (!Number.isSafeInteger(v) || v < min || v > max) fail2(`${label}\uC740(\uB294) ${min}~${max} \uC0AC\uC774\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.`);
        return v;
      };
      const facePatch = {};
      const fm = faceNumber("faceMatchBonus", 0, 1e5, "\uC9DD \uB9DE\uD788\uAE30 \uBCF4\uB108\uC2A4");
      if (fm !== void 0) facePatch.faceMatchBonus = fm;
      const fn = faceNumber("faceNameBonus", 0, 1e5, "\uC774\uB984 \uC815\uB2F5 \uBCF4\uB108\uC2A4");
      if (fn !== void 0) facePatch.faceNameBonus = fn;
      const fs3 = faceNumber("faceSelectSeconds", 10, 120, "\uCE74\uB4DC \uC120\uD0DD \uC2DC\uAC04");
      if (fs3 !== void 0) facePatch.faceSelectSeconds = fs3;
      const fnS = faceNumber("faceNameSeconds", 10, 120, "\uC774\uB984 \uC785\uB825 \uC2DC\uAC04");
      if (fnS !== void 0) facePatch.faceNameSeconds = fnS;
      if (data.facePeople !== void 0) facePatch.facePeople = validateFacePeople(data.facePeople, photoExists);
      if (data.minorityRounds !== void 0 && (!Number.isSafeInteger(data.minorityRounds) || data.minorityRounds < 1 || data.minorityRounds > 20)) fail2("\uC18C\uC218\uC758 \uC120\uD0DD \uBB38\uD56D \uC218\uB294 1~20\uC73C\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail2("\uAC8C\uC784 \uC2DC\uC791 \uC804 \uB300\uAE30\uC2E4\uC5D0\uC11C\uB9CC \uC124\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        if (game.teams.some((team) => team.table > settings.tableCount)) fail2("\uC774\uBBF8 \uC785\uC7A5\uD55C \uD14C\uC774\uBE14 \uBC88\uD638\uBCF4\uB2E4 \uC791\uAC8C \uC124\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD574\uB2F9 \uD14C\uC774\uBE14\uC744 \uBA3C\uC800 \uC81C\uC678\uD574 \uC8FC\uC138\uC694.");
        const questions = minorityQuestions ?? game.settings.minorityQuestions;
        const minorityRounds = data.minorityRounds === void 0 ? minorityQuestions ? minorityQuestions.length : game.settings.minorityRounds : data.minorityRounds;
        if (minorityRounds > questions.length) fail2("\uC124\uC815\uD55C \uBB38\uD56D \uC218\uB9CC\uD07C \uC9C8\uBB38\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
        game.settings = { ...game.settings, ...settings, blackjackRounds: hasBlackjackRounds ? settings.blackjackRounds : game.settings.blackjackRounds, minorityQuestions: questions, minorityPracticeQuestion: minorityPracticeQuestion ?? game.settings.minorityPracticeQuestion, minorityRounds, minorityBonus: minorityBonus === void 0 ? game.settings.minorityBonus : minorityBonus, ...facePatch };
        game.excludedTables = game.excludedTables.filter((table) => table <= settings.tableCount);
        for (const team of game.teams) team.chips = settings.initialChips;
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "exclude_table" || action === "include_table") {
      const table = body.table;
      if (typeof table !== "number" || !Number.isInteger(table) || table < 1 || table > 30) fail2("\uD14C\uC774\uBE14 \uBC88\uD638\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail2("\uD14C\uC774\uBE14 \uBD88\uCC38 \uC124\uC815\uC740 \uAC8C\uC784 \uC2DC\uC791 \uC804 \uB300\uAE30\uC2E4\uC5D0\uC11C\uB9CC \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        if (table > game.settings.tableCount) fail2(`\uD14C\uC774\uBE14 \uBC88\uD638 1~${game.settings.tableCount}\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.`);
        if (action === "exclude_table") {
          if (game.teams.some((team) => team.table === table)) fail2("\uC774\uBBF8 \uC785\uC7A5\uD55C \uD14C\uC774\uBE14\uC785\uB2C8\uB2E4. \uD300\uC744 \uBA3C\uC800 \uBCC4\uB3C4\uB85C \uC81C\uC678\uD574 \uC8FC\uC138\uC694.");
          if (!game.excludedTables.includes(table)) game.excludedTables.push(table);
          game.excludedTables.sort((a, b) => a - b);
        } else {
          game.excludedTables = game.excludedTables.filter((number) => number !== table);
        }
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "remove_team") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (!["lobby", "face_tutorial", "face_play", "face_result", "blackjack_tutorial", "blackjack_play", "minority_tutorial", "minority_play", "roulette_tutorial", "roulette_betting"].includes(game.phase)) fail2("\uC9C0\uAE08\uC740 \uD14C\uC774\uBE14\uC744 \uC81C\uC678\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        const index = game.teams.findIndex((t) => t.id === body.teamId);
        if (index < 0) fail2("\uD14C\uC774\uBE14\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (game.phase !== "lobby" && game.teams.length < 2) fail2("\uB9C8\uC9C0\uB9C9 \uD14C\uC774\uBE14\uC740 \uC81C\uC678\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        game.teams.splice(index, 1);
        for (const entry of game.blackjackHistory ?? []) entry.teams = entry.teams.filter((team) => team.id !== body.teamId);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_face" || action === "start_face_game" || action === "face_close" || action === "face_stop") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (action === "start_face") startFaceTutorial(game);
        else if (action === "start_face_game") startFaceGame(game);
        else if (action === "face_close") closeFaceStage(game, body.turnId);
        else stopFaceAfterTurn(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "face_set_people") {
      const people = validateFacePeople(body.facePeople, photoExists);
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail2("\uAC8C\uC784 \uC2DC\uC791 \uC804 \uB300\uAE30\uC2E4\uC5D0\uC11C\uB9CC \uC778\uBB3C\uC744 \uBC14\uAFC0 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        game.settings = { ...game.settings, facePeople: people };
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "face_pick" || action === "face_answer") {
      const teamToken = str(body.teamToken);
      const room = await mutate(code, (game) => {
        const team = requireTeam(game, teamToken);
        if (action === "face_pick") facePick(game, team.id, body.index, body.turnId);
        else faceAnswer(game, team.id, body.answer, body.turnId);
      });
      return json({ state: publicState(room, teamToken) });
    }
    if (action === "start_minority") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby" && game.phase !== "face_result") fail2("\uC774\uBBF8 \uAC8C\uC784\uC744 \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4.");
        if (!game.teams.length) fail2("\uCC38\uC5EC\uD55C \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        game.settings.initialChips = 0;
        if (game.phase === "lobby") for (const team of game.teams) team.chips = 0;
        game.minorityRound = 1;
        game.minorityHistory = [];
        game.minorityResult = null;
        game.phase = "minority_tutorial";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_minority_practice" || action === "start_minority_game" || action === "next_minority") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (action === "start_minority_practice") {
          if (game.phase !== "minority_tutorial") fail2("\uAC8C\uC784 \uC548\uB0B4 \uD654\uBA74\uC5D0\uC11C \uC5F0\uC2B5\uC744 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
          game.minorityPractice = true;
          game.minorityRound = 0;
        } else if (action === "start_minority_game") {
          if (game.phase !== "minority_tutorial" && !(game.phase === "minority_result" && game.minorityPractice)) fail2("\uC548\uB0B4 \uB610\uB294 \uC5F0\uC2B5 \uACB0\uACFC \uD654\uBA74\uC5D0\uC11C \uBCF8 \uAC8C\uC784\uC744 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
          game.minorityPractice = false;
          game.minorityRound = 1;
        } else {
          if (game.phase !== "minority_result" || game.minorityPractice || (game.minorityRound ?? 1) >= game.settings.minorityRounds) fail2("\uB2E4\uC74C \uBB38\uC81C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
          game.minorityRound = (game.minorityRound ?? 1) + 1;
        }
        startMinorityQuestion(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "minority_choose") {
      const teamToken = str(body.teamToken);
      const choice = body.choice;
      if (!Number.isInteger(choice) || choice < 0) fail2("\uC120\uD0DD\uC9C0\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      const room = await mutate(code, (game) => {
        const team = requireTeam(game, teamToken);
        if (game.phase !== "minority_play") fail2("\uC9C0\uAE08\uC740 \uC120\uD0DD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (body.minorityRound !== (game.minorityRound ?? 1)) fail2("\uBB38\uC81C\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD654\uBA74\uC744 \uD655\uC778\uD558\uACE0 \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.", 409);
        if (typeof game.minorityDeadline !== "number" || Date.now() >= game.minorityDeadline) fail2("\uC120\uD0DD \uC2DC\uAC04\uC774 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4.", 409);
        const question = game.minorityPractice ? game.settings.minorityPracticeQuestion : game.settings.minorityQuestions[(game.minorityRound ?? 1) - 1];
        if (!question || choice >= question.options.length) fail2("\uC120\uD0DD\uC9C0\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
        team.minorityChoice = choice;
      });
      return json({ state: publicState(room, teamToken) });
    }
    if (action === "reveal_minority") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "minority_play") fail2("\uACB0\uACFC\uB97C \uBC1C\uD45C\uD560 \uBB38\uC81C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (body.minorityRound !== (game.minorityRound ?? 1)) fail2("\uBB38\uC81C\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD654\uBA74\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 409);
        const question = game.minorityPractice ? game.settings.minorityPracticeQuestion : game.settings.minorityQuestions[(game.minorityRound ?? 1) - 1];
        if (!question) fail2("\uBB38\uC81C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        const result = countMinorityChoices(question.options.length, game.teams.map((team) => team.minorityChoice));
        const { winningChoices } = result;
        for (const team of game.teams) {
          const change = team.minorityChoice !== null && team.minorityChoice !== void 0 && winningChoices.includes(team.minorityChoice) ? game.settings.minorityBonus : 0;
          team.minorityChange = change;
          if (!game.minorityPractice) team.chips += change;
        }
        game.minorityResult = result;
        game.minorityResultAt = Date.now();
        game.minorityDeadline = null;
        if (!game.minorityPractice) (game.minorityHistory ??= []).push({ round: game.minorityRound ?? 1, question, result: game.minorityResult, teams: game.teams.map((team) => ({ id: team.id, table: team.table, choice: team.minorityChoice ?? null, change: team.minorityChange ?? 0, chips: team.chips })) });
        game.phase = "minority_result";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_blackjack") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "lobby") fail2("\uC774\uBBF8 \uAC8C\uC784\uC744 \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4.");
        if (!game.teams.length) fail2("\uCC38\uC5EC\uD55C \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        game.phase = "blackjack_tutorial";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_blackjack_practice") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "blackjack_tutorial") fail2("\uBE14\uB799\uC7AD \uC548\uB0B4 \uD654\uBA74\uC5D0\uC11C \uC5F0\uC2B5\uC744 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
        if (!game.teams.length) fail2("\uCC38\uC5EC\uD55C \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        game.blackjackPractice = true;
        game.blackjackPracticePlayed = true;
        game.blackjackRound = 0;
        game.blackjackHistory = [];
        dealBlackjack(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_blackjack_game") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "blackjack_tutorial" && !(game.phase === "blackjack_result" && game.blackjackPractice)) fail2("\uC5F0\uC2B5 \uACB0\uACFC\uB97C \uD655\uC778\uD55C \uB4A4 \uBCF8 \uAC8C\uC784\uC744 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
        if (!game.teams.length) fail2("\uCC38\uC5EC\uD55C \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        game.blackjackPractice = false;
        game.blackjackRound = 1;
        game.blackjackHistory = [];
        dealBlackjack(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "force_stand") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "blackjack_play") fail2("\uBE14\uB799\uC7AD \uC9C4\uD589 \uC911\uC5D0\uB9CC \uBA48\uCD9C \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        requireBlackjackRound(game, body.blackjackRound);
        const team = game.teams.find((t) => t.id === body.teamId);
        if (!team) fail2("\uD14C\uC774\uBE14\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (team.blackjackStatus !== "playing") fail2("\uC774\uBBF8 \uC120\uD0DD\uC744 \uB9C8\uCE5C \uD14C\uC774\uBE14\uC785\uB2C8\uB2E4.");
        team.blackjackStatus = "stand";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "hit" || action === "stand") {
      const teamToken = str(body.teamToken);
      const room = await mutate(code, (game) => {
        const team = requireTeam(game, teamToken);
        if (game.phase !== "blackjack_play") fail2("\uBE14\uB799\uC7AD \uC9C4\uD589 \uC911\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
        requireBlackjackRound(game, body.blackjackRound);
        if (team.blackjackStatus !== "playing") fail2("\uC774\uBBF8 \uC120\uD0DD\uC744 \uB9C8\uCCE4\uC2B5\uB2C8\uB2E4.");
        if (action === "stand") team.blackjackStatus = "stand";
        else {
          team.cards.push(card());
          const sum = total(team);
          if (sum > 21) team.blackjackStatus = "bust";
          else if (sum === 21) team.blackjackStatus = "stand";
        }
      });
      return json({ state: publicState(room, teamToken) });
    }
    if (action === "settle_blackjack") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase === "blackjack_result") return;
        if (game.phase !== "blackjack_play") fail2("\uBE14\uB799\uC7AD \uC9C4\uD589 \uC911\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
        if (game.teams.some((t) => t.blackjackStatus === "playing")) fail2("\uC544\uC9C1 \uC120\uD0DD\uC744 \uB9C8\uCE58\uC9C0 \uC54A\uC740 \uD14C\uC774\uBE14\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
        reconcileBlackjack(game);
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_roulette") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        const oldGameComplete = game.phase === "blackjack_result" && !game.blackjackPractice && (game.blackjackRound ?? 1) >= game.settings.blackjackRounds;
        const minorityComplete = game.phase === "minority_result" && !game.minorityPractice && (game.minorityRound ?? 1) >= game.settings.minorityRounds;
        if (!oldGameComplete && !minorityComplete) fail2("1\uB77C\uC6B4\uB4DC\uB97C \uBAA8\uB450 \uB9C8\uCE5C \uB4A4 \uB8F0\uB81B\uC744 \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        game.phase = "roulette_tutorial";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "start_roulette_game") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "roulette_tutorial") fail2("\uB8F0\uB81B \uC548\uB0B4 \uD654\uBA74\uC5D0\uC11C \uAC8C\uC784\uC744 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
        game.phase = "roulette_betting";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "finish_no_chips") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (!["roulette_tutorial", "roulette_betting"].includes(game.phase)) fail2("\uB8F0\uB81B \uC900\uBE44 \uB2E8\uACC4\uC5D0\uC11C\uB9CC \uCD5C\uC885 \uACB0\uACFC\uB97C \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        if (!game.teams.length || game.teams.some((team) => team.chips > 0)) fail2("\uCE69\uC744 \uBCF4\uC720\uD55C \uD14C\uC774\uBE14\uC774 \uC788\uC5B4 \uB8F0\uB81B\uC744 \uC9C4\uD589\uD574\uC57C \uD569\uB2C8\uB2E4.");
        game.phase = "finished";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "bet") {
      const teamToken = str(body.teamToken), amount = body.amount, color = body.color;
      if (color !== "red" && color !== "black" || !Number.isSafeInteger(amount) || amount < 1) fail2("\uC0C9\uACFC \uBCA0\uD305\uD560 \uCE69\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      const room = await mutate(code, (game) => {
        const team = requireTeam(game, teamToken);
        if (game.phase !== "roulette_betting") fail2("\uC774\uBC88 \uBCA0\uD305\uC740 \uB9C8\uAC10\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
        if (team.skipped) fail2("\uBCA0\uD305 \uAC74\uB108\uB6F0\uAE30\uB97C \uCDE8\uC18C\uD55C \uB4A4 \uB2E4\uC2DC \uBCA0\uD305\uD574 \uC8FC\uC138\uC694.");
        if (amount > team.chips) fail2("\uBCF4\uC720 \uCE69\uBCF4\uB2E4 \uB9CE\uC774 \uBCA0\uD305\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        team.bet = { color, amount };
        team.skipped = false;
      });
      return json({ state: publicState(room, teamToken) });
    }
    if (action === "skip_bet") {
      const teamToken = str(body.teamToken);
      const room = await mutate(code, (game) => {
        if (!teamToken) requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "roulette_betting") fail2("\uBCA0\uD305 \uC9C4\uD589 \uC911\uC5D0\uB9CC \uAC74\uB108\uB6F8 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        const team = teamToken ? requireTeam(game, teamToken) : game.teams.find((t) => t.id === body.teamId);
        if (!team) fail2("\uD14C\uC774\uBE14\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (team.chips <= 0) fail2("\uCE69\uC774 \uC5C6\uB294 \uD14C\uC774\uBE14\uC740 \uC774\uBBF8 \uAD00\uC804 \uC911\uC785\uB2C8\uB2E4.");
        if (team.bet && !teamToken) fail2("\uC774\uBBF8 \uBCA0\uD305\uD55C \uD14C\uC774\uBE14\uC740 \uAC74\uB108\uB6F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        team.bet = null;
        team.skipped = true;
      });
      return json({ state: publicState(room, teamToken, !teamToken) });
    }
    if (action === "undo_skip") {
      const teamToken = str(body.teamToken);
      const room = await mutate(code, (game) => {
        if (!teamToken) requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "roulette_betting") fail2("\uBCA0\uD305 \uC9C4\uD589 \uC911\uC5D0\uB9CC \uAC74\uB108\uB6F0\uAE30\uB97C \uCDE8\uC18C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        const team = teamToken ? requireTeam(game, teamToken) : game.teams.find((t) => t.id === body.teamId);
        if (!team) fail2("\uD14C\uC774\uBE14\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (!team.skipped) fail2("\uAC74\uB108\uB6F4 \uD14C\uC774\uBE14\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
        team.skipped = false;
      });
      return json({ state: publicState(room, teamToken, !teamToken) });
    }
    if (action === "spin") {
      const color = (import_node_crypto3.webcrypto.getRandomValues(new Uint8Array(1))[0] & 1) === 0 ? "red" : "black";
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "roulette_betting") fail2("\uC774\uBBF8 \uB8F0\uB81B\uC744 \uB3CC\uB838\uC2B5\uB2C8\uB2E4.");
        if (!game.teams.length) fail2("\uCC38\uC5EC\uD55C \uD14C\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (game.teams.some((team) => team.chips > 0 && !team.bet && !team.skipped)) fail2("\uC544\uC9C1 \uBCA0\uD305\uD558\uC9C0 \uC54A\uC740 \uD14C\uC774\uBE14\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
        const settled = [];
        for (const team of game.teams) {
          if (!team.bet) continue;
          const change = team.bet.color === color ? team.bet.amount : -team.bet.amount;
          team.chips += change;
          settled.push({ id: team.id, name: team.name, table: team.table, color: team.bet.color, amount: team.bet.amount, change, chips: team.chips });
        }
        game.history.push({ round: game.round, result: color, teams: settled });
        game.result = color;
        game.rouletteSpinStartedAt = Date.now();
        game.phase = "roulette_result";
      });
      return json({ state: publicState(room, "", true) });
    }
    if (action === "next") {
      const room = await mutate(code, (game) => {
        requireHost(body.hostToken, expectedHostToken);
        if (game.phase !== "roulette_result") fail2("\uACB0\uACFC\uB97C \uD655\uC778\uD55C \uB4A4 \uC9C4\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        if (typeof game.rouletteSpinStartedAt === "number" && Date.now() < game.rouletteSpinStartedAt + ROULETTE_SPIN_MS + ROULETTE_RESULT_HOLD_MS) fail2("\uB8F0\uB81B \uACB0\uACFC \uACF5\uAC1C\uAC00 \uB05D\uB0A0 \uB54C\uAE4C\uC9C0 \uAE30\uB2E4\uB824 \uC8FC\uC138\uC694.");
        if (game.round >= game.settings.rouletteSpins || game.teams.every((team) => team.chips === 0)) {
          game.phase = "finished";
          return;
        }
        game.round += 1;
        game.phase = "roulette_betting";
        game.result = null;
        game.rouletteSpinStartedAt = null;
        for (const team of game.teams) {
          team.bet = null;
          team.skipped = false;
        }
      });
      return json({ state: publicState(room, "", true) });
    }
    return fail2("\uC54C \uC218 \uC5C6\uB294 \uC694\uCCAD\uC785\uB2C8\uB2E4.");
  } catch (error) {
    return handleError(error);
  }
}

// server/index.ts
var PORT = Number(process.env.PORT) || 3e3;
var DATA_DIR = process.env.DATA_DIR || import_node_path2.default.join(process.cwd(), "data");
var STATE_FILE = import_node_path2.default.join(DATA_DIR, "state.json");
var CLIENT_DIR = process.env.CLIENT_DIR || import_node_path2.default.join(__dirname, "client");
var BROADCAST_MIN_INTERVAL_MS = 200;
if (!process.env.GAME_HOST_PASSWORD && !process.env.HOST_PIN) {
  console.warn("[\uACBD\uACE0] \uC6B4\uC601\uC790 \uBE44\uBC00\uBC88\uD638(GAME_HOST_PASSWORD \uB610\uB294 HOST_PIN)\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC6B4\uC601\uC790 \uB85C\uADF8\uC778\uC774 \uBD88\uAC00\uB2A5\uD569\uB2C8\uB2E4.");
}
initPhotos(DATA_DIR);
try {
  if (import_node_fs2.default.existsSync(STATE_FILE)) {
    importStore(import_node_fs2.default.readFileSync(STATE_FILE, "utf8"));
    console.log(`[state] \uBCF5\uAD6C\uB428: \uC9C4\uD589 \uC911\uC778 \uBC29 ${store.activeRoom ?? "\uC5C6\uC74C"}`);
  }
} catch (e) {
  console.error("[state] \uBCF5\uAD6C \uC2E4\uD328, \uC0C8\uB85C \uC2DC\uC791\uD569\uB2C8\uB2E4:", e.message);
}
var saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = STATE_FILE + ".tmp";
    import_node_fs2.default.mkdir(DATA_DIR, { recursive: true }, () => {
      import_node_fs2.default.writeFile(tmp, exportStore(), (err) => {
        if (err) return console.error("[state] \uC800\uC7A5 \uC2E4\uD328", err.message);
        import_node_fs2.default.rename(tmp, STATE_FILE, () => {
        });
      });
    });
  }, 1e3);
}
function saveNow() {
  try {
    import_node_fs2.default.mkdirSync(DATA_DIR, { recursive: true });
    import_node_fs2.default.writeFileSync(STATE_FILE, exportStore());
  } catch {
  }
}
var loginFails = /* @__PURE__ */ new Map();
async function guardedPost(body, who) {
  const isLogin = !!body && typeof body === "object" && body.action === "host_login";
  if (!isLogin) return POST(body);
  const now = Date.now();
  let f = loginFails.get(who);
  if (f && f.lockedUntil > now) return { status: 429, body: { error: "\uBE44\uBC00\uBC88\uD638\uB97C \uC5EC\uB7EC \uBC88 \uD2C0\uB838\uC2B5\uB2C8\uB2E4. 1\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." } };
  const r = await POST(body);
  if (r.status === 403) {
    if (!f || now - f.since > 6e4) f = { count: 0, since: now, lockedUntil: 0 };
    f.count += 1;
    if (f.count >= 5) f.lockedUntil = now + 6e4;
    loginFails.set(who, f);
  } else if (r.status < 400) loginFails.delete(who);
  return r;
}
var app = (0, import_express.default)();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use((0, import_compression.default)());
app.use("/api/game", import_express.default.json({ limit: "64kb" }));
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, room: store.activeRoom, sockets: io.engine.clientsCount });
});
app.get("/api/game", async (req, res) => {
  const r = await GET({
    active: req.query.active === "1",
    room: typeof req.query.room === "string" ? req.query.room : null,
    teamToken: req.get("x-team-token") ?? (typeof req.query.teamToken === "string" ? req.query.teamToken : null),
    hostToken: req.get("x-host-token") ?? null
  });
  res.status(r.status).set("Cache-Control", "no-store").json(r.body);
});
app.post("/api/game", async (req, res) => {
  const r = await guardedPost(req.body, req.ip || "?");
  res.status(r.status).set("Cache-Control", "no-store").json(r.body);
});
app.get("/photos/:id", (req, res) => {
  const p = getPhoto(req.params.id);
  if (!p) return res.status(404).end();
  res.set("Content-Type", p.mime).set("Cache-Control", "private, max-age=86400").send(p.data);
});
var isHostReq = async (req) => {
  const t = req.get("x-host-token");
  return !!t && t === await hostTokenForPassword().catch(() => "");
};
var bigJson = import_express.default.json({ limit: "40mb" });
app.post("/api/face/photo", bigJson, async (req, res) => {
  if (!await isHostReq(req)) return res.status(403).json({ error: "\uC6B4\uC601\uC790 \uAD8C\uD55C\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  const id = savePhotoDataUrl(req.body?.data);
  if (!id) return res.status(400).json({ error: "JPG/PNG/WEBP \uC774\uBBF8\uC9C0(1.5MB \uC774\uD558)\uB9CC \uC62C\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  res.json({ id });
});
app.get("/api/face/export", async (req, res) => {
  if (!await isHostReq(req)) return res.status(403).json({ error: "\uC6B4\uC601\uC790 \uAD8C\uD55C\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  const room = activeRoomData();
  const people = (room?.settings.facePeople || []).map((p) => ({ name: p.name, aliases: p.aliases, photo: p.photo ? photoDataUrl(p.photo) : null }));
  res.set("Content-Disposition", 'attachment; filename="face-cards.json"').json({ type: "all-in-macau-face-cards", version: 1, people });
});
app.post("/api/face/import", bigJson, async (req, res) => {
  const hostToken = req.get("x-host-token") || "";
  if (!await isHostReq(req)) return res.status(403).json({ error: "\uC6B4\uC601\uC790 \uAD8C\uD55C\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  const list = req.body?.people;
  if (!Array.isArray(list) || list.length > 40) return res.status(400).json({ error: "\uC5BC\uAD74 \uCE74\uB4DC \uD30C\uC77C \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4." });
  const people = list.map((p) => ({ name: typeof p.name === "string" ? p.name : "", aliases: Array.isArray(p.aliases) ? p.aliases : [], photo: p.photo ? savePhotoDataUrl(p.photo) : null }));
  const r = await POST({ action: "face_set_people", hostToken, facePeople: people });
  res.status(r.status).json(r.body);
});
app.use("/assets", import_express.default.static(import_node_path2.default.join(CLIENT_DIR, "assets"), { maxAge: "30d", immutable: true }));
app.use(import_express.default.static(CLIENT_DIR, { index: false, maxAge: "5m" }));
app.get(["/", "/host", "/host/", "/beam", "/beam/"], (_req, res) => {
  res.set("Cache-Control", "no-cache").sendFile(import_node_path2.default.join(CLIENT_DIR, "index.html"));
});
var server = import_node_http.default.createServer(app);
server.keepAliveTimeout = 65e3;
var io = new import_socket.Server(server, {
  pingInterval: 2e4,
  pingTimeout: 25e3,
  maxHttpBufferSize: 2e5,
  // 운영자 문항 설정 저장 대비
  perMessageDeflate: false
});
var credsOf = (s) => s.data.creds ?? null;
var keyOf = (c) => `${c.hostToken === null ? "" : "H:" + c.hostToken}|${c.teamToken}`;
async function stateFor(c) {
  return GET({ active: true, teamToken: c.teamToken, hostToken: c.hostToken });
}
var dirty = false;
var lastBroadcast = 0;
var flushing = false;
async function flush() {
  if (!dirty || flushing || Date.now() - lastBroadcast < BROADCAST_MIN_INTERVAL_MS) return;
  dirty = false;
  flushing = true;
  lastBroadcast = Date.now();
  try {
    const groups = /* @__PURE__ */ new Map();
    for (const s of io.sockets.sockets.values()) {
      const c = credsOf(s);
      if (!c) continue;
      const k = keyOf(c);
      const g = groups.get(k);
      if (g) g.sockets.push(s);
      else groups.set(k, { creds: c, sockets: [s] });
    }
    for (const g of groups.values()) {
      const r = await stateFor(g.creds);
      for (const s of g.sockets) s.emit("state", r);
    }
  } finally {
    flushing = false;
  }
}
setInterval(() => void flush(), 50);
setChangeListener(() => {
  dirty = true;
  scheduleSave();
});
setInterval(() => {
  tick();
}, 250);
io.on("connection", (socket) => {
  let bucket = 20;
  const refill = setInterval(() => bucket = 20, 1e3);
  socket.use((_packet, next) => bucket-- > 0 ? next() : next(new Error("rate")));
  socket.on("error", () => {
  });
  socket.on("disconnect", () => clearInterval(refill));
  socket.on("hello", async (msg, ack) => {
    const m = msg && typeof msg === "object" ? msg : {};
    const creds = {
      teamToken: typeof m.teamToken === "string" ? m.teamToken.slice(0, 128) : "",
      hostToken: typeof m.hostToken === "string" ? m.hostToken.slice(0, 128) : null
    };
    socket.data.creds = creds;
    const r = await stateFor(creds);
    if (typeof ack === "function") ack(r);
    else socket.emit("state", r);
  });
  socket.on("api", async (body, ack) => {
    const fwd = String(socket.handshake.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const r = await guardedPost(body, fwd || socket.handshake.address || socket.id);
    if (typeof ack === "function") ack(r);
  });
});
server.listen(PORT, () => {
  console.log(`ALL IN MACAU \uC11C\uBC84 \uC2E4\uD589: http://localhost:${PORT}  (\uCC38\uAC00\uC790 /  \xB7 \uBE54 /beam  \xB7 \uC6B4\uC601\uC790 /host)`);
});
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => {
  saveNow();
  process.exit(0);
});
