import 'uix-preparatorio/styles.css';
import '../css/designer.css';
import {bootPrismiaStudio} from '../../../app/main.js';
import notices from '../../../../THIRD_PARTY_NOTICES.txt?raw';
bootPrismiaStudio({notices}).catch(error=>{console.error(error);document.querySelector('#app').innerHTML='';const box=document.createElement('div');box.className='p-startup p-startup-error';box.textContent=`Не удалось запустить Prismia: ${error.message}`;document.querySelector('#app').append(box);});
