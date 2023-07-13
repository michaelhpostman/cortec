/**
 * The core package provides the foundation for loading various dependencies
 */
import Config from '@cortec/config';
import type { IContext, IModule, Service } from '@cortec/types';
import exit from 'exit';
import pEachSeries from 'p-each-series';
import { Signale } from 'signale';
import { dump } from 'wtfnode';

interface ICortecConfig extends Service {
  printOpenHandles?: boolean;
  silent?: boolean;
}

class Cortec implements IContext {
  service: ICortecConfig;
  private modules: Map<string, IModule> = new Map();
  private signale: Signale;
  constructor(service: ICortecConfig) {
    this.service = service;
    this.signale = new Signale({
      disabled: service.silent,
    });
    this.signale.config({
      displayLabel: false,
    });

    // Load the default config module
    this.use(new Config());

    // Attach all the process events
    process.on('SIGINT', () => this.dispose(0));
    process.on('SIGTERM', () => this.dispose(0));
    process.on('uncaughtException', () => this.dispose(1));
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }
  provide<T = unknown>(name: string): T {
    return this.modules.get(name) as T;
  }
  use(module: IModule) {
    this.modules.set(module.name, module);
  }
  dispose(code: number) {
    this.signale.await('Exiting...');
    return pEachSeries([...this.modules].reverse(), ([_name, module]) => {
      this.signale.pending('disposing module "' + module.name + '"');
      return module.dispose();
    })
      .catch((err) => {
        this.signale.fatal(err);
      })
      .finally(() => {
        this.signale.success('Exit (code: ' + code + ')');
        this.service.printOpenHandles && dump();
        exit(code);
      });
  }
  async load() {
    return pEachSeries([...this.modules], async ([name, module]) => {
      this.signale.scope('cortec').start('loading module "' + name + '"');
      await module.load(this, this.signale);
    }).catch((err) => {
      this.signale.fatal(err);
      // If any of the modules fail to load, exit the process
      this.dispose(1);
    });
  }
}

export default Cortec;
