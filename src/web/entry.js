import 'uix-preparatorio/styles.css';
import './designer.css';
import {createPrismiaStudio} from '../app/studio.js';
import notices from '../../THIRD_PARTY_NOTICES.txt?raw';
createPrismiaStudio({notices}).catch(error=>{console.error(error);document.querySelector('#app').innerHTML='';const box=document.createElement('div');box.className='p-startup p-startup-error';box.textContent=`Не удалось запустить Prismia: ${error.message}`;document.querySelector('#app').append(box);});
