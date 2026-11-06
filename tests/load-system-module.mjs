import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const modules = new URL('../modules/', import.meta.url);

/** Link real system dependencies in one VM realm, substituting only the specified boundaries. */
export async function loadSystemModule(path, context, mocks = {}) {
  const cache = new Map();
  function resolve(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const values = mocks[url.href.slice(modules.href.length)];
    const module = values
      ? new vm.SyntheticModule(Object.keys(values), function () {
          for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, {context, identifier: url.href})
      : new vm.SourceTextModule(readFileSync(url, 'utf8'), {context, identifier: url.href});
    cache.set(url.href, module);
    return module;
  }
  const entry = resolve(new URL(path, modules));
  await entry.link((specifier, parent) => resolve(new URL(specifier, parent.identifier)));
  await entry.evaluate();
  return entry;
}

export function loadActorModule(context) {
  return loadSystemModule('actors/actor-ffg.js', context, {'helpers/modifiers.js': {default: class {}}});
}
