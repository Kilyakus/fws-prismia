# FWS Prismia

Prismia — самостоятельная WebGL-студия и библиотека материалов. Основа — граф
2D-текстур и одна из трёх моделей освещения: PBR, toon или unlit. Рядом идёт
каталог редактируемых пресетов.

## Студия

Готовая сборка лежит в `standalone/index.html` — откройте её в браузере с
поддержкой WebGL 2, сервер и сеть не нужны. Как пользоваться студией, что где
лежит и какие есть ограничения — в [INSTRUCTION.md](INSTRUCTION.md).

## Разработка

Для работы нужны Node.js 20.19 или новее, npm и Git. Первая установка требует
доступа к npm и GitHub; в некоторых окружениях npm переписывает адреса GitHub на
SSH, тогда настройте git на HTTPS или дайте ему доступ к GitHub. Готовый
`standalone/index.html` от установленных зависимостей не зависит и открывается
без установки вообще.

```bash
npm ci
npm run dev                 # Vite, адрес берётся из терминала
npm test                    # граф, поверхности, API, каталог
npm run build               # пересобирает standalone/index.html
npx playwright install chromium
npm run test:studio         # GLSL, реальные WebGL-кадры, экспорт
npm run test:viewport3d     # расширения и жизненный цикл области
npm run test:viewport-settings
npm run test:graphics       # общие настройки и реальный renderer
npm run test:source-preview # вкладки 3D/2D, миграция раскладки, GLB
```

Браузерные проверки по умолчанию открывают `standalone/index.html`. Пути к
браузеру, адрес страницы и каталог для артефактов задаются переменными
окружения `CHROMIUM_PATH`, `PRISMIA_URL` и `OUTPUT_DIR`. Рендер идёт на
программном SwiftShader, так что картинку и производительность своего GPU
проверяйте отдельно.

### Обновление framework-preparatorio

Для студии нужна Git-зависимость `framework-preparatorio` и её актуальная
редакция: версия в `package.json` сама по себе ничего не гарантирует, важен
закреплённый в lockfile коммит. Если каркас менялся, сначала опубликуйте
изменения, а затем пересоберите lockfile:

```bash
mv package-lock.json package-lock.provisional.json   # сохранить старый lockfile
npm install --package-lock-only --ignore-scripts
# проверить закреплённый commit каркаса в новом lockfile
npm ci
npm run build
npm run test:viewport3d
npm run test:graphics
```

Lockfile должен указывать на тот коммит каркаса, которым собран
`standalone/index.html`, иначе браузерные проверки разойдутся со страницей.
Поэтому после любого обновления каркаса пересобирайте standalone и прогоняйте
`test:viewport3d` и `test:graphics`. Для API материалов каркас не нужен.

## Публичные API

Пакет отдаёт несколько точек входа. Основные — `fws-prismia` и
`fws-prismia/shaders`, `fws-prismia/studio`, `fws-prismia/engine`,
`fws-prismia/presets`, `fws-prismia/lighting`, `fws-prismia/material-builders`
и `fws-prismia/styles.css`. Пути `fws-prismia/graph`, `fws-prismia/materials`,
`fws-prismia/api/engine.js` и `fws-prismia/api/studio.js` — это алиасы тех же
файлов. Все они попадают в npm-архив. В каталоге `api/` лежат `engine.js` и
`studio.js`, причём studio грузится лениво, поэтому даже импорт состояния
областей не требует DOM.

### Студия в своём приложении

```js
// Для браузерной интеграции с собственным сборщиком, например Vite:
import 'uix-preparatorio/styles.css';
import 'fws-prismia/styles.css';  // содержит также стили страницы-хоста
import { createPrismiaStudio } from 'fws-prismia/studio';

const prismia = await createPrismiaStudio({ mount: '#app', restore: true });
const graphChannel = prismia.exchange.channel('graph');
const stop = graphChannel.subscribe(state => console.log(state.project.name));
graphChannel.dispatch('setSeed', 42);
stop();           // отписка
prismia.destroy();
```

`fws-prismia/studio` отдаёт паспорта десяти областей, composition/bind, state и
`createScopeExchange`. Области общаются с хостом через каналы `graph`, `view` и
`render`, а списки команд у каналов закрыты явными списками. Свою composition
можно передать прямо при создании.

### Граф и материалы

```js
import { listMaterialPresets, createMaterialPreset, listSurfacePresets,
         createSurfacePreset, attachSurfaceOutlines } from 'fws-prismia/engine';
import { createGraphStore, GraphEvaluator, createOutputTextures,
         createGraphMaterial } from 'fws-prismia/engine';

console.log(listMaterialPresets()); // id, название, описание; 15 заготовок
console.log(listSurfacePresets());  // 6 стилей поверхности
const project = createMaterialPreset('toon-ink');   // новая независимая копия
const graph = createGraphStore(project);
graph.setParam('color-map', 'high', '#d8a6f0');
graph.setSurface('rimStrength', 0.8);
graph.setSurface('specularSize', 0.55);

// Отдельный набор параметров, не привязанный к графу:
const surface = createSurfacePreset('toon-soft');
surface.toonSteps = 4;
// graph.setSurfaceValues(surface);  // применяет стиль целиком; граф не меняется

// renderer и mesh принадлежат вашему приложению, используют тот же Three.js.
const evaluator = new GraphEvaluator(renderer);
await evaluator.prepareBitmaps(graph.value.project);   // перед экспортом карт
evaluator.evaluate(graph.value.project, { time: 0 });
const textures = createOutputTextures(evaluator);      // копии, принадлежат хосту
const material = createGraphMaterial(textures, graph.value.project.surface);
const previous = mesh.material;
mesh.material = material;
const outline = attachSurfaceOutlines(mesh, graph.value.project.surface);
// ...renderer.render(scene, camera)...

// Перед заменой геометрии/материала: убрать оболочку, вернуть исходник и
// освободить собственные ресурсы. Переданные текстуры Prismia не освобождает.
outline.dispose();
mesh.material = previous;
material.dispose();
Object.values(textures).forEach(texture => texture.dispose());
evaluator.dispose();
graph.dispose();
```

Менять данные проекта само по себе ни на что не влияет: хост сам пересчитывает
выходы графа, когда это нужно, и пересоздаёт материал вместе с контуром, заранее
удалив старые ресурсы. `GraphEvaluator` владеет кэшированными render targets,
сохраняет целевой framebuffer хоста и пересчитывает только изменённые узлы с
потомками. Состояние и undo живут в `createGraphStore` и канале `graph`, а ключи
и подписи выходов можно взять из `OUTPUT_USAGES` и `OUTPUT_LABELS`.

### Готовые карты без графа

```js
import { createSurfaceMaterial, validateSurface,
         SURFACE_SCHEMA, SURFACE_DEFAULTS } from 'fws-prismia/engine';

const material = createSurfaceMaterial(
  { baseColor, normal, roughness, metallic, height,
    ambientOcclusion, emissive, opacity, rimMask, specularMask },
  settings);
```

Все ключи карт необязательные. Значения `settings` проверяются через
`validateSurface`, а схема и значения по умолчанию лежат в `SURFACE_SCHEMA` и
`SURFACE_DEFAULTS`. `roughness` и `metalness` умножают карту, а `roughnessBase`
и `metalnessBase` задают значение на случай, когда карты нет. `rimMask`
работает с PBR, toon и unlit, `specularMask` — только с toon. Контур создаётся
отдельным вызовом `attachSurfaceOutlines` и требует `dispose()`: он делит с
исходным мешем геометрию и скелет, но не владеет ими. Программные эффекты
собраны на `onBeforeCompile` и рассчитаны на WebGL и проверенную версию
Three.js, на универсальный перенос в любой renderer они не рассчитаны.

### Шейдеры поверх существующих материалов

```js
import { ShaderEngine, createPrismiaRegistry } from 'fws-prismia';

const shaders = new ShaderEngine({
  registry: createPrismiaRegistry(),
  targets: ['world'],
  defaults: { world: 'original' },
  renderer, // WebGLRenderer хоста; нужен для процедурного IBL
});

shaders.setSelection('world', 'wet-asphalt');
shaders.applyToObject(mySurface, {
  defaultTarget: 'world',
  skip: (mesh, mat) => mat.isShaderMaterial || mat.isRawShaderMaterial,
});

// В игровом цикле: абсолютное прошедшее время в секундах.
shaders.update(clock.getElapsedTime());
// ...renderer.render(scene, camera)

// Возврат оригиналов и освобождение материалов, созданных Prismia:
shaders.reset();
shaders.dispose();
```

Реестр расширяется вызовом `registry.register({ id, label, group, build })`,
причём `build` получает исходный материал и контекст и никогда не строит новый
пресет поверх предыдущего. Текстуры источника остаются у хоста. Состояние
выбора, сбор записей по целям, события и `materialSignature` лежат в
`fws-prismia`. Каталог пресетов импортируется из `fws-prismia/presets`, свет и
контроллер теней — из `fws-prismia/lighting`, а построители материалов и
градиентов — из `fws-prismia/material-builders`.

Отражения в материалах PBR — это отражения окружения IBL, ни screen-space
отражений, ни отражений реальных объектов там нет. Глобальный выбор шейдера
мира действует на все подходящие обычные меши, поэтому для точечного
применения передавайте конкретный объект или используйте `skip`.

### Исходные материалы модели

`createPrismiaRegistry()` и `BUILT_IN_SHADER_PRESETS` содержат
исходно-ориентированные пресеты `pbr`, `toon` и `unlit`: они строятся из цвета,
карт и прозрачности загруженного GLB. Для Phong toon сохраняет оригинальный
specular и ступенчато меняет прямой свет. Исходные текстуры не копируются и не
уничтожаются движком, внешний код может продолжать их обновлять, а при
переключении на `original` возвращается исходный материал. Специальные
ShaderMaterial, например волосы с GPU-симуляцией, требуют адаптера приложения.
В студии режим выбирается в панели «Материал → Материал 3D-просмотра»,
переключение режима граф не удаляет.

### Свет и тени

```js
import { DirectionalShadowVolume } from 'fws-prismia/lighting';

const volume = new DirectionalShadowVolume({ scene, light: sun, extent: 22 });
// После обновления камеры и направления света, перед render:
volume.update(player.position, { viewDirection: cameraDirection, lead: 4 });
renderer.shadowMap.needsUpdate = true; // если autoUpdate выключен
```

`extent` здесь — половина ширины карты теней в метрах, а не дальность видимости.
Каскадных теней нет. Конструкция рассчитана на `DirectionalLight` и его target
как прямых потомков одной не масштабированной сцены.

```js
import { createLookMixer, LOOK_PROFILES } from 'fws-prismia/lighting';

const mixer = createLookMixer({ scene, renderer, hemiLight, ambientLight,
                                keyLight, fillLight, rimLight });
mixer.set('sunrise', { duration: 0.7 });
mixer.update(dt);
```

Кастомный профиль должен задавать полный набор полей, взяв за образец любой
встроенный профиль. Готовые профили доступны как `LOOK_PROFILES`.

## Установка пакета

Peer-зависимость `three` ограничена диапазоном >= 0.186.1 и < 0.188.0, в этой
сборке проверена версия 0.186.1. `three` — это peer, то есть хост должен
использовать один экземпляр Three.js. Самый надёжный локальный способ —
упаковать библиотеку и установить полученный архив:

```bash
cd /путь/к/fws-prismia
npm pack                      # fws-prismia-1.1.0.tgz
cd /путь/к/моему-проекту
npm install three@0.186.1 /путь/к/fws-prismia/fws-prismia-1.1.0.tgz
npm ls three                  # один экземпляр, deduped
```

Упакованный файл исключает dev-зависимости. Если подключаете папку напрямую,
не используйте символическую ссылку с собственным `node_modules` — так можно
получить второй экземпляр Three.js. Для Vite и монорепозитория настройте
`resolve.dedupe: ['three']` и peer resolution в сборщике.

## Область viewport3d

Рантайм области лежит в `framework-preparatorio/src/scopes/viewport3d` и
устанавливается из Git-зависимости, локальная копия в проекте не нужна.
Документация runtime — в `framework-preparatorio/src/scopes/viewport3d/README.md`
установленного пакета. Область в каркасе по умолчанию скрыта, приложение явно
включает её через `builtInScopes.viewport3d.enabled`. Сцена, камера, основной
renderer и плагины используют Three.js хоста, а граф материала, свет и
управление остаются в `src/plugins/viewport3d/`. Канонический scope называется
`viewport3d`, прежний lookup `registry.get('viewport')` сохранён.

Настройки графики — экспозиция, тени, тонмаппинг — синхронизированы с панелью
«Свет» и хранятся отдельно от JSON-проекта в `localStorage` под ключом
`fws-prismia.viewport-graphics.v1`. Если хранилище запрещено, вид просто
работает без сохранения. Кнопка сброса в панели возвращает графические
параметры, но не трогает граф материала.

## Лицензии

Сам проект распространяется по лицензии MIT — текст в файле `LICENSE`. Сторонние
компоненты и их лицензии собраны в `THIRD_PARTY_NOTICES.txt` и в меню
«Файл → Лицензии компонентов».
