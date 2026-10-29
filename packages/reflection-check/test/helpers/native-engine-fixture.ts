import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fixture, png } from "./reflection-fixture.js";

export async function nativeFixture(mode = "pass"): Promise<string> {
  const root = await fixture();
  const engine = path.join(root, "node_modules/reflection-check");
  await mkdir(engine, {
    recursive: true,
  });
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(engine, "package.json"),
    JSON.stringify({
      name: "reflection-check",
      version: "0.7.0",
      type: "module",
      exports: {
        ".": {
          import: "./index.mjs",
        },
      },
      bin: {
        reflection: "cli.mjs",
      },
    }),
  );
  await writeFile(
    path.join(engine, "index.mjs"),
    `import {readFile} from 'node:fs/promises'; import path from 'node:path'; import {createHash} from 'node:crypto';
export const reflectionCapabilities={browserCaptureObservation:1,externallyManagedBaselines:1};
export function hash(bytes){return createHash('sha256').update(bytes).digest('hex')}
export function computeResultHash(checks){return {verdict:hash(JSON.stringify(checks)),measured:hash(JSON.stringify(checks))}}
export async function hashReportInputs({configDir,configFile,declared,baselineFiles}) { const inputs=[{role:'config',path:configFile},...baselineFiles.map(path=>({role:'baseline',path})),...declared]; const unique=new Map(inputs.map(input=>[input.role+'\\0'+input.path,input])); return Promise.all([...unique.values()].map(async input=>{const bytes=await readFile(input.path);return {role:input.role,key:path.relative(configDir,input.path),hashKind:'bytes',sha256:hash(bytes),bytes:bytes.length}})) }
`,
  );
  await writeFile(
    path.join(root, "mode.json"),
    JSON.stringify({
      mode,
    }),
  );
  await writeFile(
    path.join(root, "engine-config.mjs"),
    `import path from 'node:path'; export function createReflectionConfig(request){return {project:'fixture', inputs:[{role:'implementation',path:'mode.json'}],contracts:{browser:{baseUrl:'http://fixture.test',evidenceHooks:{observe:async()=>({}),expectedFonts:async()=>[]},routes:request.cases.map(test=>({id:test.id,path:test.route,viewports:[{name:'frame',...test.intent.viewport}]})),visualSmoke:request.cases.map(test=>({id:test.id,ref:test.reference,route:test.id,viewport:'frame',capture:{selector:'#root',measured:true},externallyManaged:true,baselineRoot:request.baselineRoot,baseline:path.basename(test.baseline.path),threshold:{maxDiffPixelRatio:test.threshold}}))}}}}`,
  );
  await writeFile(
    path.join(engine, "cli.mjs"),
    `import {mkdir,readFile,writeFile} from 'node:fs/promises'; import path from 'node:path'; import {pathToFileURL} from 'node:url'; import {hash,hashReportInputs,computeResultHash} from './index.mjs';
const value=flag=>process.argv[process.argv.indexOf(flag)+1];const configFile=value('--config'); const config=(await import(pathToFileURL(configFile))).default; const reportRoot=value('--report-dir'); const run=path.join(reportRoot,'runs','fixture');await mkdir(run,{recursive:true});
const mode=JSON.parse(await readFile(path.join(process.cwd(),'mode.json'),'utf8')).mode;
const inputs=await hashReportInputs({configDir:path.dirname(configFile),configFile,declared:config.inputs,baselineFiles:config.contracts.browser.visualSmoke.map(test=>path.join(test.baselineRoot,test.baseline))});
const checks=[];for(const test of config.contracts.browser.visualSmoke){
 const actual=path.join('visual',test.id,'actual.png');await mkdir(path.dirname(path.join(run,actual)),{recursive:true});const bytes=Buffer.from('${png.toString("base64")}','base64');await writeFile(path.join(run,actual),bytes);const diff=path.join('visual',test.id,'diff.png');await writeFile(path.join(run,diff),bytes);
 const capture={schemaVersion:1,root:'#root',rootBox:{x:0,y:0,width:1,height:1},clip:{x:0,y:0,width:1,height:1},rounding:'outward-css-pixels',deviceScaleFactor:1,browser:{name:'chromium',version:'fixture'},fonts:[{family:'Test Sans',weight:'400',style:'normal',status:'loaded'}],pointer:{x:-10,y:-10,outsideRoot:true,hoveredControls:0},scroll:{x:0,y:0},layoutSamples:3,occlusion:{samples:5,blocked:0}};
 checks.push({id:'browser.'+test.id,suite:'browser',status:(mode==='route-failure'||(mode==='partial-route-failure'&&test.id==='empty'))?'fail':'pass',metadata:{routeId:test.route,viewport:test.viewport},artifacts:[]});
 const visual={id:'visual.'+test.id,suite:'visual',status:mode==='drift'?'fail':'pass',metadata:{classification:mode==='drift'?'visual-diff':'visual-match',ref:test.ref,routeId:test.route,viewport:test.viewport,baselinePath:test.baseline,threshold:test.threshold,dimensionMismatch:false,comparator:{name:'pixelmatch',version:'7.2.0',threshold:0.1,includeAA:false},diffRatio:mode==='drift'?0.2:0},artifacts:[{path:actual,role:'actual',sha256:hash(bytes),bytes:bytes.length},{path:diff,role:'diff',sha256:hash(bytes),bytes:bytes.length}],evidence:[{kind:'browser-capture-observation',data:{url:'http://fixture.test/dashboard',observed:{viewport:{width:1,height:1},theme:'dark',state:'empty',fixture:'no-items'},fonts:['Test Sans'],fontsReady:true,capture}}]};
 if(mode==='missing-evidence')delete visual.evidence;if(mode==='wrong-reference')visual.metadata.ref='wrong';if(mode==='bad-artifact')visual.artifacts[0].sha256='0'.repeat(64);if(mode!=='omitted')checks.push(visual);if(mode==='duplicate')checks.push(visual);
}
if(mode==='mutate-original')await writeFile(path.join(process.cwd(),'design/empty.png'),'changed');
const report={schemaVersion:2,runId:'fixture',mode:'smoke',status:['drift','route-failure','partial-route-failure'].includes(mode)?'fail':'pass',environment:{reflectionVersion:'0.7.0'},checks,inputs,resultHash:computeResultHash(checks)};await writeFile(path.join(run,'report.json'),JSON.stringify(report)); process.exitCode=['drift','route-failure','partial-route-failure'].includes(mode)?1:mode==='tool-error'?2:0;
`,
  );
  return root;
}
