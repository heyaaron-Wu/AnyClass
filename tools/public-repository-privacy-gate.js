#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process"),zlib=require("node:zlib");
const PASS="ANYCLASS_PUBLIC_REPOSITORY_PRIVACY_GATE_PASS",BLOCKED="ANYCLASS_PUBLIC_REPOSITORY_PRIVACY_GATE_BLOCKED";
const block=()=>{process.stdout.write(`${BLOCKED}\n`);process.exitCode=1};
const repo=path.resolve(process.argv.includes("--repo")?process.argv[process.argv.indexOf("--repo")+1]:process.cwd());
const denyPath=process.env.ANYCLASS_PUBLIC_PRIVACY_DENYLIST;
const readConfig=()=>{if(!denyPath)throw Error("CONFIG_MISSING");const parsed=JSON.parse(fs.readFileSync(denyPath,"utf8"));if(parsed?.version!==1||!Array.isArray(parsed.terms)||!parsed.terms.length||parsed.terms.some(value=>typeof value!=="string"||!value.trim()))throw Error("CONFIG_INVALID");return parsed};
const variants=value=>{const text=value.trim(),unicode=[...text].map(character=>`\\u${character.codePointAt(0).toString(16).padStart(4,"0")}`).join("");return [...new Set([text,text.toLowerCase(),encodeURIComponent(text),encodeURIComponent(text).toLowerCase(),unicode,unicode.toUpperCase()])]};
const textRisk=[/(?:password|passwd|api[_-]?key|secret|authorization|cookie|session|token)\s*[:=]\s*["'][^"']{6,}["']/i,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/[A-Z]:\\Users\\(?!Public\\)[^\\\s]+/i,/\/(?:home|Users)\/(?!example(?:\/|$))[^\s"']+/i,/(?<![\d.-])(?!(?:127\.0\.0\.1|0\.0\.0\.0)(?![\d.-]))(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.-])/,/\b(?:i-[a-z0-9]{8,}|instance[-_]?id\s*[:=])\b/i,/[\w.+-]+@(?!example\.(?:com|edu)|users\.noreply\.github\.com)[\w.-]+\.[A-Za-z]{2,}/];
const archive=/\.(?:zip|tar|tgz|tar\.gz|7z|rar)$/i,screenshot=/\.(?:png|jpe?g|webp|gif|bmp|tiff?)$/i;
const allowedBrand=/^app\/assets\/brand\/(?:AnyClass_[A-Za-z0-9_-]+\.(?:ico|png)|BRAND_ASSET_MANIFEST\.json)$/;
const present=()=>{
  const files=[];
  const visit=(directory,relative="")=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){if(!relative&&entry.name===".git")continue;const child=relative?`${relative}/${entry.name}`:entry.name,absolute=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error("UNREADABLE_ENTRY");if(entry.isDirectory())visit(absolute,child);else if(entry.isFile())files.push(child);else throw Error("UNREADABLE_ENTRY")}};
  visit(repo);
  return files;
};
const historyObjects=()=>{const output=cp.execFileSync("git",["-C",repo,"rev-list","--objects","--all"],{encoding:"utf8"});return output.split(/\r?\n/).filter(Boolean).map(line=>line.split(" ",2));};
const inspect=(name,buffer,terms)=>{const normalized=name.replace(/\\/g,"/");if(archive.test(normalized))return false;if(screenshot.test(normalized)&&!allowedBrand.test(normalized))return false;if(buffer.length>20*1024*1024)return false;if(/\.gz$/i.test(normalized)){try{return inspect(normalized.replace(/\.gz$/i,""),zlib.gunzipSync(buffer),terms)}catch(_){return false}}if(buffer.includes(0))return /\.(?:ico|png)$/i.test(normalized)&&allowedBrand.test(normalized);const text=buffer.toString("utf8"),lower=text.toLowerCase();if(terms.some(term=>variants(term).some(value=>lower.includes(value.toLowerCase()))))return false;if(textRisk.some(pattern=>pattern.test(text)))return false;return true};
try{const config=readConfig(),terms=config.terms;for(const file of present())if(!inspect(file,fs.readFileSync(path.join(repo,file)),terms))throw Error("BLOCKED");if(process.argv.includes("--history")){for(const [oid,name=""] of historyObjects()){const type=cp.execFileSync("git",["-C",repo,"cat-file","-t",oid],{encoding:"utf8"}).trim();if(type==="blob"&&!inspect(name,cp.execFileSync("git",["-C",repo,"cat-file","blob",oid]),terms))throw Error("BLOCKED")}const log=cp.execFileSync("git",["-C",repo,"log","--all","--format=%B"],{encoding:"utf8"});if(!inspect("git-history-messages",Buffer.from(log),terms))throw Error("BLOCKED")}process.stdout.write(`${PASS}\n`)}catch(_){block()}
