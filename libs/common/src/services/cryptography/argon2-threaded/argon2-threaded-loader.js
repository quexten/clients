"use strict";

var global = typeof window === "undefined" ? self : window;
var root = typeof window === "undefined" ? "../" : "";

function isLoaded() {
  return !(global.Module == undefined || global.Module._argon2_hash_ext == undefined);
}

async function loadWasmModule(simd) {
  const KB = 1024 * 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;
  const WASM_PAGE_SIZE = 64 * 1024;

  const mem = 1024 * 64;
  const totalMemory = (2 * GB - 64 * KB) / 1024 / WASM_PAGE_SIZE;
  const initialMemory = Math.min(
    Math.max(Math.ceil((mem * 1024) / WASM_PAGE_SIZE), 256) + 256,
    totalMemory
  );

  const wasmMemory = new WebAssembly.Memory({
    initial: initialMemory,
    maximum: totalMemory,
    shared: true,
  });

  global.Module = {
    print: console.log,
    printErr: console.log,
    setStatus: console.log,
    wasmBinary: null,
    wasmMemory: wasmMemory,
    buffer: wasmMemory.buffer,
    TOTAL_MEMORY: initialMemory * WASM_PAGE_SIZE,
  };

  var wasmFileName = "argon2-threaded.wasm";
  if (simd) {
    wasmFileName = "argon2-simd-threaded.wasm";
  }

  var wasmBinary = await (await fetch(root + "scripts/" + wasmFileName)).arrayBuffer();
  global.Module.wasmBinary = wasmBinary;

  await new Promise((resolve, reject) => {
    global.Module.postRun = resolve;

    loadScript(
      root + "scripts/argon2.js",
      function () {
        console.log("Script loaded and executed.");
      },
      function () {
        console.log("Script load failed.");
      }
    );
  });
}

async function hash(hashOptions) {
  console.log(hashOptions);
  if (!isLoaded()) {
    await loadWasmModule();
  }

  var iterations = hashOptions.time;
  var memory = hashOptions.mem;
  var parallelism = hashOptions.parallelism;
  var pwd = allocateArray(hashOptions.pass);
  var pwdlen = hashOptions.pass.length;
  var salt = allocateArray(hashOptions.salt);
  var saltlen = hashOptions.salt.length;
  var hash = Module.allocate(new Array(hashOptions.hashLen), "i8", Module.ALLOC_NORMAL);
  var hashlen = hashOptions.hashLen;
  var encoded = Module.allocate(new Array(512), "i8", Module.ALLOC_NORMAL);
  var encodedlen = 512;
  var secret = 0;
  var secretlen = 0;
  var ad = 0;
  var adlen = 0;
  var argon2_type = hashOptions.type;
  var version = 0x13;
  var err;
  console.log({
    iterations,
    memory,
    parallelism,
    pwd,
    pwdlen,
    salt,
    saltlen,
    hash,
    hashlen,
    encoded,
    encodedlen,
    argon2_type,
    secret,
    secretlen,
    ad,
    adlen,
    version,
  });
  try {
    var res = Module._argon2_hash_ext(
      iterations,
      memory,
      parallelism,
      pwd,
      pwdlen,
      salt,
      saltlen,
      hash,
      hashlen,
      encoded,
      encodedlen,
      argon2_type,
      secret,
      secretlen,
      ad,
      adlen,
      version
    );
  } catch (e) {
    err = e;
  }
  if (res === 0 && !err) {
    var hashArr = [];
    for (var i = hash; i < hash + hashlen; i++) {
      hashArr.push(Module.HEAP8[i]);
    }
    console.log("Encoded: " + Module.UTF8ToString(encoded));
    console.log(
      "Hash: " +
        hashArr
          .map(function (b) {
            return ("0" + (0xff & b).toString(16)).slice(-2);
          })
          .join("")
    );

    console.log(hashArr);
    return {
      hash: new Uint8Array(hashArr),
      encoded: Module.UTF8ToString(encoded),
    };
  } else {
    try {
      if (!err) {
        err = Module.UTF8ToString(Module._argon2_error_message(res));
      }
    } catch (e) {}
    console.log("Error: " + res + (err ? ": " + err : ""));
  }
  try {
    Module._free(pwd);
    Module._free(salt);
    Module._free(hash);
    Module._free(encoded);
  } catch (e) {}
}

function encodeUtf8(str) {
  return new TextEncoder().encode(str);
}

function allocateArray(arr) {
  return Module.allocate(arr, "i8", Module.ALLOC_NORMAL);
}

function loadScript(src, onload, onerror) {
  var el = document.createElement("script");
  el.src = src;
  el.onload = onload;
  el.onerror = onerror;
  document.body.appendChild(el);
}

module.exports = {
  isLoaded,
  loadWasmModule,
  hash,
};
