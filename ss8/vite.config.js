const { defineConfig } = require('vite');

module.exports = defineConfig({
  assetsInclude: ['**/*.hdr', '**/*.glb', '**/*.gltf']
});