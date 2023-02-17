function GROWABLE_HEAP_U8() {
  if (wasmMemory.buffer != HEAP8.buffer) {
    updateMemoryViews();
  }
  return HEAPU8;
}
function GROWABLE_HEAP_I32() {
  if (wasmMemory.buffer != HEAP8.buffer) {
    updateMemoryViews();
  }
  return HEAP32;
}
function GROWABLE_HEAP_U32() {
  if (wasmMemory.buffer != HEAP8.buffer) {
    updateMemoryViews();
  }
  return HEAPU32;
}
function GROWABLE_HEAP_F64() {
  if (wasmMemory.buffer != HEAP8.buffer) {
    updateMemoryViews();
  }
  return HEAPF64;
}
var Module = typeof Module != "undefined" ? Module : {};
var moduleOverrides = Object.assign({}, Module);
var arguments_ = [];
var thisProgram = "./this.program";
var quit_ = (status, toThrow) => {
  throw toThrow;
};
var ENVIRONMENT_IS_WEB = typeof window == "object";
var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
var ENVIRONMENT_IS_NODE =
  typeof process == "object" &&
  typeof process.versions == "object" &&
  typeof process.versions.node == "string";
var ENVIRONMENT_IS_PTHREAD = Module["ENVIRONMENT_IS_PTHREAD"] || false;
var _scriptDir =
  typeof document != "undefined" && document.currentScript ? document.currentScript.src : undefined;
if (ENVIRONMENT_IS_WORKER) {
  _scriptDir = self.location.href;
} else if (ENVIRONMENT_IS_NODE) {
  _scriptDir = __filename;
}
var scriptDirectory = "";
function locateFile(path) {
  if (Module["locateFile"]) {
    return Module["locateFile"](path, scriptDirectory);
  }
  return scriptDirectory + path;
}
var read_, readAsync, readBinary, setWindowTitle;
function logExceptionOnExit(e) {
  if (e instanceof ExitStatus) return;
  let toLog = e;
  err("exiting due to exception: " + toLog);
}
if (ENVIRONMENT_IS_NODE) {
  var fs = require("fs");
  var nodePath = require("path");
  if (ENVIRONMENT_IS_WORKER) {
    scriptDirectory = nodePath.dirname(scriptDirectory) + "/";
  } else {
    scriptDirectory = __dirname + "/";
  }
  read_ = (filename, binary) => {
    filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
    return fs.readFileSync(filename, binary ? undefined : "utf8");
  };
  readBinary = (filename) => {
    var ret = read_(filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    return ret;
  };
  readAsync = (filename, onload, onerror) => {
    filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
    fs.readFile(filename, function (err, data) {
      if (err) onerror(err);
      else onload(data.buffer);
    });
  };
  if (process["argv"].length > 1) {
    thisProgram = process["argv"][1].replace(/\\/g, "/");
  }
  arguments_ = process["argv"].slice(2);
  if (typeof module != "undefined") {
    module["exports"] = Module;
  }
  process["on"]("uncaughtException", function (ex) {
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  var nodeMajor = process.version.match(/^v(\d+)\./)[1];
  if (nodeMajor < 15) {
    process["on"]("unhandledRejection", function (reason) {
      throw reason;
    });
  }
  quit_ = (status, toThrow) => {
    if (keepRuntimeAlive()) {
      process["exitCode"] = status;
      throw toThrow;
    }
    logExceptionOnExit(toThrow);
    process["exit"](status);
  };
  Module["inspect"] = function () {
    return "[Emscripten Module object]";
  };
  let nodeWorkerThreads;
  try {
    nodeWorkerThreads = require("worker_threads");
  } catch (e) {
    console.error(
      'The "worker_threads" module is not supported in this node.js build - perhaps a newer version is needed?'
    );
    throw e;
  }
  global.Worker = nodeWorkerThreads.Worker;
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) {
    scriptDirectory = self.location.href;
  } else if (typeof document != "undefined" && document.currentScript) {
    scriptDirectory = document.currentScript.src;
  }
  if (scriptDirectory.indexOf("blob:") !== 0) {
    scriptDirectory = scriptDirectory.substr(
      0,
      scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1
    );
  } else {
    scriptDirectory = "";
  }
  if (!ENVIRONMENT_IS_NODE) {
    read_ = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, false);
      xhr.send(null);
      return xhr.responseText;
    };
    if (ENVIRONMENT_IS_WORKER) {
      readBinary = (url) => {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.responseType = "arraybuffer";
        xhr.send(null);
        return new Uint8Array(xhr.response);
      };
    }
    readAsync = (url, onload, onerror) => {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.onload = () => {
        if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
          onload(xhr.response);
          return;
        }
        onerror();
      };
      xhr.onerror = onerror;
      xhr.send(null);
    };
  }
  setWindowTitle = (title) => (document.title = title);
} else {
}
if (ENVIRONMENT_IS_NODE) {
  if (typeof performance == "undefined") {
    global.performance = require("perf_hooks").performance;
  }
}
var defaultPrint = console.log.bind(console);
var defaultPrintErr = console.warn.bind(console);
if (ENVIRONMENT_IS_NODE) {
  defaultPrint = (str) => fs.writeSync(1, str + "\n");
  defaultPrintErr = (str) => fs.writeSync(2, str + "\n");
}
var out = Module["print"] || defaultPrint;
var err = Module["printErr"] || defaultPrintErr;
Object.assign(Module, moduleOverrides);
moduleOverrides = null;
if (Module["arguments"]) arguments_ = Module["arguments"];
if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
if (Module["quit"]) quit_ = Module["quit"];
var wasmBinary;
if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
var noExitRuntime = Module["noExitRuntime"] || true;
if (typeof WebAssembly != "object") {
  abort("no native wasm support detected");
}
var wasmMemory;
var wasmModule;
var ABORT = false;
var EXITSTATUS;
function assert(condition, text) {
  if (!condition) {
    abort(text);
  }
}
var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder("utf8") : undefined;
function UTF8ArrayToString(heapOrArray, idx, maxBytesToRead) {
  idx >>>= 0;
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
  if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
    return UTF8Decoder.decode(
      heapOrArray.buffer instanceof SharedArrayBuffer
        ? heapOrArray.slice(idx, endPtr)
        : heapOrArray.subarray(idx, endPtr)
    );
  }
  var str = "";
  while (idx < endPtr) {
    var u0 = heapOrArray[idx++];
    if (!(u0 & 128)) {
      str += String.fromCharCode(u0);
      continue;
    }
    var u1 = heapOrArray[idx++] & 63;
    if ((u0 & 224) == 192) {
      str += String.fromCharCode(((u0 & 31) << 6) | u1);
      continue;
    }
    var u2 = heapOrArray[idx++] & 63;
    if ((u0 & 240) == 224) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
    }
    if (u0 < 65536) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 65536;
      str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
    }
  }
  return str;
}
function UTF8ToString(ptr, maxBytesToRead) {
  ptr >>>= 0;
  return ptr ? UTF8ArrayToString(GROWABLE_HEAP_U8(), ptr, maxBytesToRead) : "";
}
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
function updateMemoryViews() {
  var b = wasmMemory.buffer;
  Module["HEAP8"] = HEAP8 = new Int8Array(b);
  Module["HEAP16"] = HEAP16 = new Int16Array(b);
  Module["HEAP32"] = HEAP32 = new Int32Array(b);
  Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
  Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
  Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
  Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
  Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
}
var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 16777216;
assert(
  INITIAL_MEMORY >= 65536,
  "INITIAL_MEMORY should be larger than STACK_SIZE, was " +
    INITIAL_MEMORY +
    "! (STACK_SIZE=" +
    65536 +
    ")"
);
if (ENVIRONMENT_IS_PTHREAD) {
  wasmMemory = Module["wasmMemory"];
} else {
  if (Module["wasmMemory"]) {
    wasmMemory = Module["wasmMemory"];
  } else {
    wasmMemory = new WebAssembly.Memory({
      initial: INITIAL_MEMORY / 65536,
      maximum: 4294967296 / 65536,
      shared: true,
    });
    if (!(wasmMemory.buffer instanceof SharedArrayBuffer)) {
      err(
        "requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag"
      );
      if (ENVIRONMENT_IS_NODE) {
        err(
          "(on node you may need: --experimental-wasm-threads --experimental-wasm-bulk-memory and/or recent version)"
        );
      }
      throw Error("bad memory");
    }
  }
}
updateMemoryViews();
INITIAL_MEMORY = wasmMemory.buffer.byteLength;
var wasmTable;
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
function keepRuntimeAlive() {
  return noExitRuntime;
}
function preRun() {
  if (Module["preRun"]) {
    if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
    while (Module["preRun"].length) {
      addOnPreRun(Module["preRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}
function initRuntime() {
  runtimeInitialized = true;
  if (ENVIRONMENT_IS_PTHREAD) return;
  callRuntimeCallbacks(__ATINIT__);
}
function postRun() {
  if (ENVIRONMENT_IS_PTHREAD) return;
  if (Module["postRun"]) {
    if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
    while (Module["postRun"].length) {
      addOnPostRun(Module["postRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
function addRunDependency(id) {
  runDependencies++;
  if (Module["monitorRunDependencies"]) {
    Module["monitorRunDependencies"](runDependencies);
  }
}
function removeRunDependency(id) {
  runDependencies--;
  if (Module["monitorRunDependencies"]) {
    Module["monitorRunDependencies"](runDependencies);
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback();
    }
  }
}
function abort(what) {
  if (Module["onAbort"]) {
    Module["onAbort"](what);
  }
  what = "Aborted(" + what + ")";
  err(what);
  ABORT = true;
  EXITSTATUS = 1;
  what += ". Build with -sASSERTIONS for more info.";
  var e = new WebAssembly.RuntimeError(what);
  throw e;
}
var dataURIPrefix = "data:application/octet-stream;base64,";
function isDataURI(filename) {
  return filename.startsWith(dataURIPrefix);
}
function isFileURI(filename) {
  return filename.startsWith("file://");
}
var wasmBinaryFile;
wasmBinaryFile = "argon2-simd-threaded.wasm";
if (!isDataURI(wasmBinaryFile)) {
  wasmBinaryFile = locateFile(wasmBinaryFile);
}
function getBinary(file) {
  try {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  } catch (err) {
    abort(err);
  }
}
function getBinaryPromise() {
  if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
    if (typeof fetch == "function" && !isFileURI(wasmBinaryFile)) {
      return fetch(wasmBinaryFile, { credentials: "same-origin" })
        .then(function (response) {
          if (!response["ok"]) {
            throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
          }
          return response["arrayBuffer"]();
        })
        .catch(function () {
          return getBinary(wasmBinaryFile);
        });
    } else {
      if (readAsync) {
        return new Promise(function (resolve, reject) {
          readAsync(
            wasmBinaryFile,
            function (response) {
              resolve(new Uint8Array(response));
            },
            reject
          );
        });
      }
    }
  }
  return Promise.resolve().then(function () {
    return getBinary(wasmBinaryFile);
  });
}
function createWasm() {
  var info = { a: wasmImports };
  function receiveInstance(instance, module) {
    var exports = instance.exports;
    Module["asm"] = exports;
    registerTLSInit(Module["asm"]["B"]);
    wasmTable = Module["asm"]["z"];
    addOnInit(Module["asm"]["t"]);
    wasmModule = module;
    PThread.loadWasmModuleToAllWorkers(() => removeRunDependency("wasm-instantiate"));
  }
  addRunDependency("wasm-instantiate");
  function receiveInstantiationResult(result) {
    receiveInstance(result["instance"], result["module"]);
  }
  function instantiateArrayBuffer(receiver) {
    return getBinaryPromise()
      .then(function (binary) {
        return WebAssembly.instantiate(binary, info);
      })
      .then(function (instance) {
        return instance;
      })
      .then(receiver, function (reason) {
        err("failed to asynchronously prepare wasm: " + reason);
        abort(reason);
      });
  }
  function instantiateAsync() {
    if (
      !wasmBinary &&
      typeof WebAssembly.instantiateStreaming == "function" &&
      !isDataURI(wasmBinaryFile) &&
      !isFileURI(wasmBinaryFile) &&
      !ENVIRONMENT_IS_NODE &&
      typeof fetch == "function"
    ) {
      return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function (response) {
        var result = WebAssembly.instantiateStreaming(response, info);
        return result.then(receiveInstantiationResult, function (reason) {
          err("wasm streaming compile failed: " + reason);
          err("falling back to ArrayBuffer instantiation");
          return instantiateArrayBuffer(receiveInstantiationResult);
        });
      });
    } else {
      return instantiateArrayBuffer(receiveInstantiationResult);
    }
  }
  if (Module["instantiateWasm"]) {
    try {
      var exports = Module["instantiateWasm"](info, receiveInstance);
      return exports;
    } catch (e) {
      err("Module.instantiateWasm callback failed with error: " + e);
      return false;
    }
  }
  instantiateAsync();
  return {};
}
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
}
function killThread(pthread_ptr) {
  var worker = PThread.pthreads[pthread_ptr];
  delete PThread.pthreads[pthread_ptr];
  worker.terminate();
  __emscripten_thread_free_data(pthread_ptr);
  PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker), 1);
  worker.pthread_ptr = 0;
}
function cancelThread(pthread_ptr) {
  var worker = PThread.pthreads[pthread_ptr];
  worker.postMessage({ cmd: "cancel" });
}
function cleanupThread(pthread_ptr) {
  var worker = PThread.pthreads[pthread_ptr];
  assert(worker);
  PThread.returnWorkerToPool(worker);
}
function spawnThread(threadParams) {
  var worker = PThread.getNewWorker();
  if (!worker) {
    return 6;
  }
  PThread.runningWorkers.push(worker);
  PThread.pthreads[threadParams.pthread_ptr] = worker;
  worker.pthread_ptr = threadParams.pthread_ptr;
  var msg = {
    cmd: "run",
    start_routine: threadParams.startRoutine,
    arg: threadParams.arg,
    pthread_ptr: threadParams.pthread_ptr,
  };
  if (ENVIRONMENT_IS_NODE) {
    worker.ref();
  }
  worker.postMessage(msg, threadParams.transferList);
  return 0;
}
var SYSCALLS = {
  varargs: undefined,
  get: function () {
    SYSCALLS.varargs += 4;
    var ret = GROWABLE_HEAP_I32()[(SYSCALLS.varargs - 4) >>> 2];
    return ret;
  },
  getStr: function (ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
  },
};
function _proc_exit(code) {
  if (ENVIRONMENT_IS_PTHREAD) return _emscripten_proxy_to_main_thread_js(1, 1, code);
  EXITSTATUS = code;
  if (!keepRuntimeAlive()) {
    PThread.terminateAllThreads();
    if (Module["onExit"]) Module["onExit"](code);
    ABORT = true;
  }
  quit_(code, new ExitStatus(code));
}
function exitJS(status, implicit) {
  EXITSTATUS = status;
  if (!implicit) {
    if (ENVIRONMENT_IS_PTHREAD) {
      exitOnMainThread(status);
      throw "unwind";
    } else {
    }
  }
  _proc_exit(status);
}
var _exit = exitJS;
function handleException(e) {
  if (e instanceof ExitStatus || e == "unwind") {
    return EXITSTATUS;
  }
  quit_(1, e);
}
var PThread = {
  unusedWorkers: [],
  runningWorkers: [],
  tlsInitFunctions: [],
  pthreads: {},
  init: function () {
    if (ENVIRONMENT_IS_PTHREAD) {
      PThread.initWorker();
    } else {
      PThread.initMainThread();
    }
  },
  initMainThread: function () {
    var pthreadPoolSize = 16;
    while (pthreadPoolSize--) {
      PThread.allocateUnusedWorker();
    }
  },
  initWorker: function () {
    noExitRuntime = false;
  },
  setExitStatus: function (status) {
    EXITSTATUS = status;
  },
  terminateAllThreads: function () {
    for (var worker of Object.values(PThread.pthreads)) {
      PThread.returnWorkerToPool(worker);
    }
    for (var worker of PThread.unusedWorkers) {
      worker.terminate();
    }
    PThread.unusedWorkers = [];
  },
  returnWorkerToPool: function (worker) {
    var pthread_ptr = worker.pthread_ptr;
    delete PThread.pthreads[pthread_ptr];
    PThread.unusedWorkers.push(worker);
    PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker), 1);
    worker.pthread_ptr = 0;
    if (ENVIRONMENT_IS_NODE) {
      worker.unref();
    }
    __emscripten_thread_free_data(pthread_ptr);
  },
  receiveObjectTransfer: function (data) {},
  threadInitTLS: function () {
    PThread.tlsInitFunctions.forEach((f) => f());
  },
  loadWasmModuleToWorker: (worker) =>
    new Promise((onFinishedLoading) => {
      worker.onmessage = (e) => {
        var d = e["data"];
        var cmd = d["cmd"];
        if (worker.pthread_ptr) PThread.currentProxiedOperationCallerThread = worker.pthread_ptr;
        if (d["targetThread"] && d["targetThread"] != _pthread_self()) {
          var targetWorker = PThread.pthreads[d.targetThread];
          if (targetWorker) {
            targetWorker.postMessage(d, d["transferList"]);
          } else {
            err(
              'Internal error! Worker sent a message "' +
                cmd +
                '" to target pthread ' +
                d["targetThread"] +
                ", but that thread no longer exists!"
            );
          }
          PThread.currentProxiedOperationCallerThread = undefined;
          return;
        }
        if (cmd === "processProxyingQueue") {
          executeNotifiedProxyingQueue(d["queue"]);
        } else if (cmd === "spawnThread") {
          spawnThread(d);
        } else if (cmd === "cleanupThread") {
          cleanupThread(d["thread"]);
        } else if (cmd === "killThread") {
          killThread(d["thread"]);
        } else if (cmd === "cancelThread") {
          cancelThread(d["thread"]);
        } else if (cmd === "loaded") {
          worker.loaded = true;
          if (ENVIRONMENT_IS_NODE && !worker.pthread_ptr) {
            worker.unref();
          }
          onFinishedLoading(worker);
        } else if (cmd === "print") {
          out("Thread " + d["threadId"] + ": " + d["text"]);
        } else if (cmd === "printErr") {
          err("Thread " + d["threadId"] + ": " + d["text"]);
        } else if (cmd === "alert") {
          alert("Thread " + d["threadId"] + ": " + d["text"]);
        } else if (d.target === "setimmediate") {
          worker.postMessage(d);
        } else if (cmd === "callHandler") {
          Module[d["handler"]](...d["args"]);
        } else if (cmd) {
          err("worker sent an unknown command " + cmd);
        }
        PThread.currentProxiedOperationCallerThread = undefined;
      };
      worker.onerror = (e) => {
        var message = "worker sent an error!";
        err(message + " " + e.filename + ":" + e.lineno + ": " + e.message);
        throw e;
      };
      if (ENVIRONMENT_IS_NODE) {
        worker.on("message", function (data) {
          worker.onmessage({ data: data });
        });
        worker.on("error", function (e) {
          worker.onerror(e);
        });
        worker.on("detachedExit", function () {});
      }
      var handlers = [];
      var knownHandlers = ["onExit", "onAbort", "print", "printErr"];
      for (var handler of knownHandlers) {
        if (Module.hasOwnProperty(handler)) {
          handlers.push(handler);
        }
      }
      worker.postMessage({
        cmd: "load",
        handlers: handlers,
        urlOrBlob: Module["mainScriptUrlOrBlob"] || _scriptDir,
        wasmMemory: wasmMemory,
        wasmModule: wasmModule,
      });
    }),
  loadWasmModuleToAllWorkers: function (onMaybeReady) {
    if (ENVIRONMENT_IS_PTHREAD) {
      return onMaybeReady();
    }
    let pthreadPoolReady = Promise.all(PThread.unusedWorkers.map(PThread.loadWasmModuleToWorker));
    pthreadPoolReady.then(onMaybeReady);
  },
  allocateUnusedWorker: function () {
    var worker;
    var pthreadMainJs = locateFile("argon2.worker.js");
    worker = new Worker(pthreadMainJs);
    PThread.unusedWorkers.push(worker);
  },
  getNewWorker: function () {
    if (PThread.unusedWorkers.length == 0) {
      PThread.allocateUnusedWorker();
      PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0]);
    }
    return PThread.unusedWorkers.pop();
  },
};
Module["PThread"] = PThread;
function callRuntimeCallbacks(callbacks) {
  while (callbacks.length > 0) {
    callbacks.shift()(Module);
  }
}
function establishStackSpace() {
  var pthread_ptr = _pthread_self();
  var stackTop = GROWABLE_HEAP_I32()[(pthread_ptr + 52) >>> 2];
  var stackSize = GROWABLE_HEAP_I32()[(pthread_ptr + 56) >>> 2];
  var stackMax = stackTop - stackSize;
  _emscripten_stack_set_limits(stackTop, stackMax);
  stackRestore(stackTop);
}
Module["establishStackSpace"] = establishStackSpace;
function exitOnMainThread(returnCode) {
  if (ENVIRONMENT_IS_PTHREAD) return _emscripten_proxy_to_main_thread_js(2, 0, returnCode);
  try {
    _exit(returnCode);
  } catch (e) {
    handleException(e);
  }
}
var wasmTableMirror = [];
function getWasmTableEntry(funcPtr) {
  var func = wasmTableMirror[funcPtr];
  if (!func) {
    if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
    wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
  }
  return func;
}
function invokeEntryPoint(ptr, arg) {
  var result = getWasmTableEntry(ptr)(arg);
  if (keepRuntimeAlive()) {
    PThread.setExitStatus(result);
  } else {
    __emscripten_thread_exit(result);
  }
}
Module["invokeEntryPoint"] = invokeEntryPoint;
function registerTLSInit(tlsInitFunc) {
  PThread.tlsInitFunctions.push(tlsInitFunc);
}
function ___emscripten_init_main_thread_js(tb) {
  __emscripten_thread_init(tb, !ENVIRONMENT_IS_WORKER, 1, !ENVIRONMENT_IS_WEB);
  PThread.threadInitTLS();
}
function ___emscripten_thread_cleanup(thread) {
  if (!ENVIRONMENT_IS_PTHREAD) cleanupThread(thread);
  else postMessage({ cmd: "cleanupThread", thread: thread });
}
function pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg) {
  if (ENVIRONMENT_IS_PTHREAD)
    return _emscripten_proxy_to_main_thread_js(3, 1, pthread_ptr, attr, startRoutine, arg);
  return ___pthread_create_js(pthread_ptr, attr, startRoutine, arg);
}
function ___pthread_create_js(pthread_ptr, attr, startRoutine, arg) {
  if (typeof SharedArrayBuffer == "undefined") {
    err("Current environment does not support SharedArrayBuffer, pthreads are not available!");
    return 6;
  }
  var transferList = [];
  var error = 0;
  if (ENVIRONMENT_IS_PTHREAD && (transferList.length === 0 || error)) {
    return pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg);
  }
  if (error) return error;
  var threadParams = {
    startRoutine: startRoutine,
    pthread_ptr: pthread_ptr,
    arg: arg,
    transferList: transferList,
  };
  if (ENVIRONMENT_IS_PTHREAD) {
    threadParams.cmd = "spawnThread";
    postMessage(threadParams, transferList);
    return 0;
  }
  return spawnThread(threadParams);
}
function __dlinit(main_dso_handle) {}
var dlopenMissingError =
  "To use dlopen, you need enable dynamic linking, see https://github.com/emscripten-core/emscripten/wiki/Linking";
function __dlopen_js(handle) {
  abort(dlopenMissingError);
}
function __dlsym_catchup_js(handle, symbolIndex) {
  abort(dlopenMissingError);
}
function __emscripten_default_pthread_stack_size() {
  return 65536;
}
function __emscripten_err(str) {
  err(UTF8ToString(str));
}
function executeNotifiedProxyingQueue(queue) {
  Atomics.store(GROWABLE_HEAP_I32(), queue >> 2, 1);
  if (_pthread_self()) {
    __emscripten_proxy_execute_task_queue(queue);
  }
  Atomics.compareExchange(GROWABLE_HEAP_I32(), queue >> 2, 1, 0);
}
Module["executeNotifiedProxyingQueue"] = executeNotifiedProxyingQueue;
function __emscripten_notify_task_queue(targetThreadId, currThreadId, mainThreadId, queue) {
  if (targetThreadId == currThreadId) {
    setTimeout(() => executeNotifiedProxyingQueue(queue));
  } else if (ENVIRONMENT_IS_PTHREAD) {
    postMessage({ targetThread: targetThreadId, cmd: "processProxyingQueue", queue: queue });
  } else {
    var worker = PThread.pthreads[targetThreadId];
    if (!worker) {
      return;
    }
    worker.postMessage({ cmd: "processProxyingQueue", queue: queue });
  }
  return 1;
}
function __emscripten_set_offscreencanvas_size(target, width, height) {
  return -1;
}
function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    if (ENVIRONMENT_IS_NODE) text = "warning: " + text;
    err(text);
  }
}
function _emscripten_check_blocking_allowed() {
  if (ENVIRONMENT_IS_NODE) return;
  if (ENVIRONMENT_IS_WORKER) return;
  warnOnce(
    "Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread"
  );
}
var _emscripten_get_now;
if (ENVIRONMENT_IS_NODE) {
  _emscripten_get_now = () => {
    var t = process["hrtime"]();
    return t[0] * 1e3 + t[1] / 1e6;
  };
} else _emscripten_get_now = () => performance.timeOrigin + performance.now();
function _emscripten_memcpy_big(dest, src, num) {
  GROWABLE_HEAP_U8().copyWithin(dest >>> 0, src >>> 0, (src + num) >>> 0);
}
function withStackSave(f) {
  var stack = stackSave();
  var ret = f();
  stackRestore(stack);
  return ret;
}
function _emscripten_proxy_to_main_thread_js(index, sync) {
  var numCallArgs = arguments.length - 2;
  var outerArgs = arguments;
  return withStackSave(() => {
    var serializedNumCallArgs = numCallArgs;
    var args = stackAlloc(serializedNumCallArgs * 8);
    var b = args >> 3;
    for (var i = 0; i < numCallArgs; i++) {
      var arg = outerArgs[2 + i];
      GROWABLE_HEAP_F64()[(b + i) >>> 0] = arg;
    }
    return _emscripten_run_in_main_runtime_thread_js(index, serializedNumCallArgs, args, sync);
  });
}
var _emscripten_receive_on_main_thread_js_callArgs = [];
function _emscripten_receive_on_main_thread_js(index, numCallArgs, args) {
  _emscripten_receive_on_main_thread_js_callArgs.length = numCallArgs;
  var b = args >> 3;
  for (var i = 0; i < numCallArgs; i++) {
    _emscripten_receive_on_main_thread_js_callArgs[i] = GROWABLE_HEAP_F64()[(b + i) >>> 0];
  }
  var func = proxiedFunctionTable[index];
  return func.apply(null, _emscripten_receive_on_main_thread_js_callArgs);
}
function getHeapMax() {
  return 4294901760;
}
function emscripten_realloc_buffer(size) {
  var b = wasmMemory.buffer;
  try {
    wasmMemory.grow((size - b.byteLength + 65535) >>> 16);
    updateMemoryViews();
    return 1;
  } catch (e) {}
}
function _emscripten_resize_heap(requestedSize) {
  var oldSize = GROWABLE_HEAP_U8().length;
  requestedSize = requestedSize >>> 0;
  if (requestedSize <= oldSize) {
    return false;
  }
  var maxHeapSize = getHeapMax();
  if (requestedSize > maxHeapSize) {
    return false;
  }
  let alignUp = (x, multiple) => x + ((multiple - (x % multiple)) % multiple);
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
    var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
    var replacement = emscripten_realloc_buffer(newSize);
    if (replacement) {
      return true;
    }
  }
  return false;
}
function _emscripten_unwind_to_js_event_loop() {
  throw "unwind";
}
var printCharBuffers = [null, [], []];
function printChar(stream, curr) {
  var buffer = printCharBuffers[stream];
  if (curr === 0 || curr === 10) {
    (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
    buffer.length = 0;
  } else {
    buffer.push(curr);
  }
}
function _fd_write(fd, iov, iovcnt, pnum) {
  if (ENVIRONMENT_IS_PTHREAD)
    return _emscripten_proxy_to_main_thread_js(4, 1, fd, iov, iovcnt, pnum);
  var num = 0;
  for (var i = 0; i < iovcnt; i++) {
    var ptr = GROWABLE_HEAP_U32()[iov >>> 2];
    var len = GROWABLE_HEAP_U32()[(iov + 4) >>> 2];
    iov += 8;
    for (var j = 0; j < len; j++) {
      printChar(fd, GROWABLE_HEAP_U8()[(ptr + j) >>> 0]);
    }
    num += len;
  }
  GROWABLE_HEAP_U32()[pnum >>> 2] = num;
  return 0;
}
var ALLOC_NORMAL = 0;
var ALLOC_STACK = 1;
function allocate(slab, allocator) {
  var ret;
  if (allocator == ALLOC_STACK) {
    ret = stackAlloc(slab.length);
  } else {
    ret = _malloc(slab.length);
  }
  if (!slab.subarray && !slab.slice) {
    slab = new Uint8Array(slab);
  }
  GROWABLE_HEAP_U8().set(slab, ret >>> 0);
  return ret;
}
PThread.init();
var proxiedFunctionTable = [null, _proc_exit, exitOnMainThread, pthreadCreateProxied, _fd_write];
var wasmImports = {
  r: ___emscripten_init_main_thread_js,
  e: ___emscripten_thread_cleanup,
  p: ___pthread_create_js,
  k: __dlinit,
  m: __dlopen_js,
  l: __dlsym_catchup_js,
  q: __emscripten_default_pthread_stack_size,
  c: __emscripten_err,
  j: __emscripten_notify_task_queue,
  h: __emscripten_set_offscreencanvas_size,
  i: _emscripten_check_blocking_allowed,
  b: _emscripten_get_now,
  s: _emscripten_memcpy_big,
  g: _emscripten_receive_on_main_thread_js,
  n: _emscripten_resize_heap,
  f: _emscripten_unwind_to_js_event_loop,
  o: _exit,
  d: _fd_write,
  a: wasmMemory,
};
var asm = createWasm();
var ___wasm_call_ctors = function () {
  return (___wasm_call_ctors = Module["asm"]["t"]).apply(null, arguments);
};
var _argon2_hash = (Module["_argon2_hash"] = function () {
  return (_argon2_hash = Module["_argon2_hash"] = Module["asm"]["u"]).apply(null, arguments);
});
var _malloc = (Module["_malloc"] = function () {
  return (_malloc = Module["_malloc"] = Module["asm"]["v"]).apply(null, arguments);
});
var _free = (Module["_free"] = function () {
  return (_free = Module["_free"] = Module["asm"]["w"]).apply(null, arguments);
});
var _argon2_verify = (Module["_argon2_verify"] = function () {
  return (_argon2_verify = Module["_argon2_verify"] = Module["asm"]["x"]).apply(null, arguments);
});
var _argon2_error_message = (Module["_argon2_error_message"] = function () {
  return (_argon2_error_message = Module["_argon2_error_message"] = Module["asm"]["y"]).apply(
    null,
    arguments
  );
});
var _argon2_hash_ext = (Module["_argon2_hash_ext"] = function () {
  return (_argon2_hash_ext = Module["_argon2_hash_ext"] = Module["asm"]["A"]).apply(
    null,
    arguments
  );
});
var __emscripten_tls_init = (Module["__emscripten_tls_init"] = function () {
  return (__emscripten_tls_init = Module["__emscripten_tls_init"] = Module["asm"]["B"]).apply(
    null,
    arguments
  );
});
var _pthread_self = (Module["_pthread_self"] = function () {
  return (_pthread_self = Module["_pthread_self"] = Module["asm"]["C"]).apply(null, arguments);
});
var ___errno_location = function () {
  return (___errno_location = Module["asm"]["__errno_location"]).apply(null, arguments);
};
var __emscripten_thread_init = (Module["__emscripten_thread_init"] = function () {
  return (__emscripten_thread_init = Module["__emscripten_thread_init"] = Module["asm"]["D"]).apply(
    null,
    arguments
  );
});
var __emscripten_thread_crashed = (Module["__emscripten_thread_crashed"] = function () {
  return (__emscripten_thread_crashed = Module["__emscripten_thread_crashed"] =
    Module["asm"]["E"]).apply(null, arguments);
});
var _emscripten_main_browser_thread_id = function () {
  return (_emscripten_main_browser_thread_id =
    Module["asm"]["emscripten_main_browser_thread_id"]).apply(null, arguments);
};
var _emscripten_main_thread_process_queued_calls = function () {
  return (_emscripten_main_thread_process_queued_calls =
    Module["asm"]["emscripten_main_thread_process_queued_calls"]).apply(null, arguments);
};
var _emscripten_run_in_main_runtime_thread_js = function () {
  return (_emscripten_run_in_main_runtime_thread_js = Module["asm"]["F"]).apply(null, arguments);
};
var _emscripten_dispatch_to_thread_ = function () {
  return (_emscripten_dispatch_to_thread_ = Module["asm"]["emscripten_dispatch_to_thread_"]).apply(
    null,
    arguments
  );
};
var __emscripten_proxy_execute_task_queue = (Module["__emscripten_proxy_execute_task_queue"] =
  function () {
    return (__emscripten_proxy_execute_task_queue = Module[
      "__emscripten_proxy_execute_task_queue"
    ] =
      Module["asm"]["G"]).apply(null, arguments);
  });
var __emscripten_thread_free_data = function () {
  return (__emscripten_thread_free_data = Module["asm"]["H"]).apply(null, arguments);
};
var __emscripten_thread_exit = (Module["__emscripten_thread_exit"] = function () {
  return (__emscripten_thread_exit = Module["__emscripten_thread_exit"] = Module["asm"]["I"]).apply(
    null,
    arguments
  );
});
var _emscripten_stack_set_limits = function () {
  return (_emscripten_stack_set_limits = Module["asm"]["J"]).apply(null, arguments);
};
var stackSave = function () {
  return (stackSave = Module["asm"]["K"]).apply(null, arguments);
};
var stackRestore = function () {
  return (stackRestore = Module["asm"]["L"]).apply(null, arguments);
};
var stackAlloc = function () {
  return (stackAlloc = Module["asm"]["M"]).apply(null, arguments);
};
Module["UTF8ToString"] = UTF8ToString;
Module["keepRuntimeAlive"] = keepRuntimeAlive;
Module["wasmMemory"] = wasmMemory;
Module["ExitStatus"] = ExitStatus;
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["allocate"] = allocate;
var calledRun;
dependenciesFulfilled = function runCaller() {
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller;
};
function run() {
  if (runDependencies > 0) {
    return;
  }
  if (ENVIRONMENT_IS_PTHREAD) {
    initRuntime();
    startWorker(Module);
    return;
  }
  preRun();
  if (runDependencies > 0) {
    return;
  }
  function doRun() {
    if (calledRun) return;
    calledRun = true;
    Module["calledRun"] = true;
    if (ABORT) return;
    initRuntime();
    if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
    postRun();
  }
  if (Module["setStatus"]) {
    Module["setStatus"]("Running...");
    setTimeout(function () {
      setTimeout(function () {
        Module["setStatus"]("");
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
if (Module["preInit"]) {
  if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
  while (Module["preInit"].length > 0) {
    Module["preInit"].pop()();
  }
}
run();
if (typeof module !== "undefined") module.exports = Module;
Module.unloadRuntime = function () {
  if (typeof self !== "undefined") {
    delete self.Module;
  }
  Module =
    jsModule =
    wasmMemory =
    wasmTable =
    asm =
    buffer =
    HEAP8 =
    HEAPU8 =
    HEAP16 =
    HEAPU16 =
    HEAP32 =
    HEAPU32 =
    HEAPF32 =
    HEAPF64 =
      undefined;
  if (typeof module !== "undefined") {
    delete module.exports;
  }
};
