import {readdir,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildCards(){
const names=(await readdir(root+'cards')).filter(n=>/\.(png|jpe?g|webp)$/i.test(n));
const back=names.filter(n=>/^back\./i.test(n));
if(back.length>1)throw Error('뒷면 이미지는 back.png/jpg/webp 중 하나만 넣어주세요.');
const faces=names.filter(n=>!back.includes(n)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
if(faces.length>120)throw Error('앞면 카드는 최대 120장입니다.');
async function image(n){if(!/^[A-Za-z0-9._-]+$/.test(n))throw Error('이미지 파일명을 영문/숫자로 바꿔주세요.');if((await stat(root+'cards/'+n)).size>2*1024*1024)throw Error(n+': 2MB를 초과합니다.');return 'cards/'+n}
const resources={faces:await Promise.all(faces.map(image)),back:back.length?await image(back[0]):null,version:Date.now()};
await writeFile(root+'cards/resources.json',JSON.stringify(resources));
console.log(`프로젝트 카드: 앞면 ${faces.length}장 / 뒷면 ${back.length}장`);
return resources;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildCards();
