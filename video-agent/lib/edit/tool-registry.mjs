/** Explicit allow-list for tools exposed to the video agent. */
export class ToolRegistry {
  #tools = new Map();
  register(name, handler, meta = {}) {
    if (!/^[a-z_]+(?:\.[a-z_]+)+$/.test(name)) throw new TypeError(`Invalid tool name: ${name}`);
    if (this.#tools.has(name)) throw new Error(`Tool already registered: ${name}`);
    if (typeof handler !== 'function') throw new TypeError(`Tool handler must be a function: ${name}`);
    this.#tools.set(name, { name, handler, ...meta }); return this;
  }
  has(name) { return this.#tools.has(name); }
  get(name) { return this.#tools.get(name) || null; }
  list() { return [...this.#tools.values()].map(({handler, ...tool}) => tool); }
  async call(name, input, context = {}) {
    const tool = this.#tools.get(name);
    if (!tool) throw new Error(`Tool is not registered: ${name}`);
    if (context.signal?.aborted) throw new Error('Agent run cancelled');
    return tool.handler(input, context);
  }
}

export function createCoreToolRegistry(adapters = {}) {
  const registry = new ToolRegistry();
  const add = (name, key) => registry.register(name, adapters[key] || (() => ({ status: 'not_implemented', tool: name })));
  for (const [name, key] of [
    ['project.status','projectStatus'], ['project.open','projectOpen'], ['project.save','projectSave'],
    ['assets.inspect','assetInspect'], ['assets.find','assetFind'], ['speech.transcribe','transcribe'],
    ['rough_cut.detect_silence','detectSilence'], ['rough_cut.detect_scenes','detectScenes'],
    ['timeline.build','timelineBuild'], ['timeline.apply','timelineApply'], ['timeline.inspect','timelineInspect'],
    ['preview.check','previewCheck'], ['render.export','render'],
    ['history.undo','undo'], ['history.redo','redo'], ['history.restore','restore']
  ]) add(name, key);
  return registry;
}

