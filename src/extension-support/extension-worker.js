/* eslint-env worker */

const ArgumentType = require('../extension-support/argument-type');
const BlockType = require('../extension-support/block-type');
const dispatch = require('../dispatch/worker-dispatch');
const TargetType = require('../extension-support/target-type');

class ExtensionWorker {
    constructor () {
        this.nextExtensionId = 0;

        this.initialRegistrations = [];

        dispatch.waitForConnection.then(() => {
            dispatch.call('extensions', 'allocateWorker').then(x => {
                const [id, extension] = x;
                this.workerId = id;

                try {
                    // 这里引入 js 并会调用 register(), 在下方promise之后， 触发onWorkerInit
                    importScripts(extension);

                    const initialRegistrations = this.initialRegistrations;
                    this.initialRegistrations = null;

                    Promise.all(initialRegistrations).then(() => dispatch.call('extensions', 'onWorkerInit', id));
                } catch (e) {
                    dispatch.call('extensions', 'onWorkerInit', id, e);
                }
            });
        });

        this.extensions = [];
    }
    // 注册信息至 extension manager
    register (extensionObject) {
        const extensionId = this.nextExtensionId++;
        this.extensions.push(extensionObject);
        const serviceName = `extension.${this.workerId}.${extensionId}`;
        // 在 worker-dispatch 中注册 extension 实例， 在 central-dispatch 中注册 self -> Worker
        const promise = dispatch.setService(serviceName, extensionObject)
            .then(() => dispatch.call('extensions', 'registerExtensionService', serviceName));
        if (this.initialRegistrations) {
            this.initialRegistrations.push(promise);
        }
        return promise;
    }
}

global.Scratch = global.Scratch || {};
global.Scratch.ArgumentType = ArgumentType;
global.Scratch.BlockType = BlockType;
global.Scratch.TargetType = TargetType;

/**
 * Expose only specific parts of the worker to extensions.
 */

// 外部 extension 内需要手动调用  Scratch.extensions.register(new MachineLearningText())  用于注册信息至 extension manager
const extensionWorker = new ExtensionWorker();
global.Scratch.extensions = {
    register: extensionWorker.register.bind(extensionWorker)
};
