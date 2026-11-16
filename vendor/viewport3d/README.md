# @fws/viewport3d

Общий 3D-runtime для Prismia, Evolvia и Morphia. Это один исходный пакет: он создаёт сцену, камеру и WebGL-рендерер, присоединяет принадлежащий ему canvas, управляет размером, кадром и жизненным циклом расширений. Пакет **не импортирует Three.js**: хост передаёт свой `THREE`, а OrbitControls и проектные объекты создают плагины. Так в интегрированной студии не появляется второй Three.js. Отдельные рендереры миниатюр и вычислительные рендер-таргеты проектов не являются вторыми основными viewport.

## Минимальный хост

```js
import * as THREE from 'three';
import { createViewport3D } from '@fws/viewport3d';

const viewport = createViewport3D({
  THREE, container: document.querySelector('#canvas-host'),
  cameraOptions: { kind: 'perspective', args: [34, 1, 0.1, 100] },
  rendererOptions: { antialias: true },
  scopes: ['viewport3d', 'example'],
  apis: { color: 0x54c7a9 },
});
viewport.registerPlugin({
  id: 'example-mesh',
  requires: { scopes: ['example'], apis: ['color'] },
  activate({ viewport, apis, defer }) {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: apis.color });
    const mesh = new THREE.Mesh(geometry, material);
    viewport.scene.add(mesh);
    defer(() => { mesh.removeFromParent(); geometry.dispose(); material.dispose(); });
    return { api: { mesh } };
  },
});
viewport.camera.position.z = 4;
viewport.onResize(({width, height}) => {
  viewport.camera.aspect = width / height;
  viewport.camera.updateProjectionMatrix();
});
viewport.observeResize();
viewport.start(() => viewport.render(), {driver:'renderer'});
// Позже: viewport.dispose();
```

`canvas` можно передать извне; его DOM не переносится и не удаляется. `renderer` тоже можно передать извне: по умолчанию он остаётся собственностью хоста; `ownRenderer:true` передаёт владение пакету. Без внешнего renderer пакет создаёт и освобождает его сам. На сцене общим кодом **не освобождаются** чужие геометрия/материалы/текстуры — их освобождает создавший плагин. Источники кадров: `start(fn,{driver:'raf'})`, `start(fn,{driver:'renderer'})` или внешний цикл, вызывающий `render()`; одновременно работает только один цикл пакета. Morphia использует свой существующий цикл движка и вызывает общий `render()` из Stage.

## Контракт расширения

```js
export default {
  id: 'my-feature',
  requires: { scopes: ['viewport3d', 'properties'], apis: ['engine'], plugins: ['another-feature'] },
  activate({viewport, scopes, apis, signal, defer}) {
    // scopes.has(id), apis.engine; viewport.getPlugin('another-feature')
    // signal автоматически abort при деактивации.
    const unsubscribe = apis.engine.on('change', () => {});
    defer(unsubscribe); // будет вызван в обратном порядке даже при исключении
    return { api: { /* публичные методы */ }, dispose() { /* необязательно */ } };
  },
};
```

`requires.scopes`, `requires.apis`, `requires.plugins` — необязательные массивы. Отсутствующая зависимость оставляет плагин ожидающим. `registerPlugin` / `registerPlugins`, `unregisterPlugin`, `getPlugin`, `listPlugins`, `setScopeAvailable(id, boolean)` и `setApi(name, value)` доступны на экземпляре. `null`/`undefined` удаляют API. При потере зависимости сначала отключаются зависимые плагины, потом их поставщик; при восстановлении порядок обратный. Замена API перезапускает только зависящие от него плагины и их зависимых. Дубликаты и циклы отклоняются. Неудачная синхронная активация вызывает `defer` и откатывает активированные в этой операции плагины; изменение scope/API возвращается к прежнему значению. `dispose` идемпотентен.

`activate` синхронный: асинхронно загрузите модуль/данные **до** регистрации. Плагин может запустить собственную асинхронную работу, но обязан реагировать на `signal` и при позднем завершении не оставлять ресурсы. `defer` регистрируется сразу после каждого выделения; `dispose`, возвращённый плагином, дополнителен. Создавать второй renderer внутри плагина основного viewport нельзя; если нужен отдельный renderer миниатюр, он должен иметь независимое владение и очистку.

`onResize` возвращает отписку, доступные фазы — `before` и `after`. `observeResize({window:true})` также слушает размер окна; `disconnectResize()` отменяет наблюдение. `ignoreZeroSize:true` сохраняет последний кадр в скрытой панели. `configure` позволяет хосту задать цвет, тонмаппинг и тени, `retryWithoutAntialias:true` повторяет создание WebGL без MSAA. Пакет не навязывает разметку, CSS, свет, камеру OrbitControls или предметную модель.

## Где лежат расширения

* **Prismia:** `src/plugins/viewport3d/index.js` — материал/граф и инструменты камеры. Дополнительный default-export дескриптора из `src/plugins/viewport3d/extensions/*.js` обнаруживается сборкой; при программном создании студии можно передать `viewportPlugins` и `viewportApis`. Экземпляр: `studio.viewport3d`.
* **Evolvia:** `src/plugins/viewport3d/` — сфера, манекен, выбор зон и интеграция волос; паспорт обнаруживается вместе с другими плагинами. Новый каталог `src/plugins/<имя>/register.js` с `kind:'viewport-extension'`, `engine:'viewport3d'`, `load:()=>import('./index.js')` и `index.js`, экспортирующим массив дескрипторов, подключается автоматически. API возвращённого приложения: `app.viewport3d`.
* **Morphia:** `src/plugins/viewport3d/stage.js` — прежние настройки студии, свет, окружение, тени и управление; `src/plugins/viewport3d/extensions/gizmo.js` — роза осей, `scope-sync.js` — синхронизация доступности и отписка. Новые default-export дескрипторы в `extensions/*.js` обнаруживаются сборкой. Экземпляр: `window.Morphia.viewport3d` и `displaySurface.viewport3d`. Состав доступных scopes синхронизируется при переключении; оригинальный шаблон и параметры сцены Morphia не заменялись.

Во всех трёх реестрах канонический id scope — `viewport3d`. Для прежней раскладки Prismia/Evolvia сохраняется `areaId: 'viewport'` и поддерживается старый lookup `registry.get('viewport')`; перечисление scopes и зависимости плагинов используют `viewport3d`. У каждой поставки лежит идентичная локальная копия пакета в `vendor/viewport3d/`; исходник и npm-архив пакета также поставляются отдельно. Это не опубликованный пакет. После изменения канонического исходника выполните из этой папки `node tools/sync-vendors.mjs`, а для проверки — `node tools/sync-vendors.mjs --check`. Затем переустановите локальные зависимости (`npm ci`) и пересоберите приложения: npm с `install-links=true` устанавливает копии пакета, а не живые ссылки.

## Проверки

`npm test` — автономные проверки владения canvas/рендерером, размеров, кадров, отсутствующих зависимостей, порядка активации и очистки, изменения API, отката при ошибке и повторного dispose. Проектные тесты дополнительно проверяют реальные браузерные интеграции.
