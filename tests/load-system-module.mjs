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
      : new vm.SourceTextModule(readFileSync(url, 'utf8'), {context, identifier: url.href,
          importModuleDynamically: async (specifier, parent) => {
            const dependency = resolve(new URL(specifier, parent.identifier));
            if (dependency.status === 'unlinked') await dependency.link(link);
            if (dependency.status === 'linked') await dependency.evaluate();
            return dependency;
          },
        });
    cache.set(url.href, module);
    return module;
  }
  const link = (specifier, parent) => resolve(new URL(specifier, parent.identifier));
  const entry = resolve(new URL(path, modules));
  await entry.link(link);
  await entry.evaluate();
  return entry;
}

export function loadActorModule(context) {
  return loadSystemModule('actors/actor-ffg.js', context, {'helpers/modifiers.js': {default: class {}}});
}

/** Add the system translator to fixtures with explicit dependency linkers. */
export function linkWithSystemLocalization(module, context, link) {
  return module.link((specifier, ...args) => {
    if (!specifier.endsWith('/system-localization.mjs')) return link(specifier, ...args);
    return new vm.SourceTextModule(readFileSync(new URL('helpers/system-localization.mjs', modules), 'utf8'), {context});
  });
}
