const webpack = require('webpack');

module.exports = function override(config, env) {
    // 1. Fix for standard node modules
    config.resolve.fallback = {
        ...config.resolve.fallback,
        "fs": false,
        "path": false,
        "os": false,
        "stream": false,
        "constants": false,
    };

    // 2. Fix for the "node:fs" prefix error
    // This plugin catches any import starting with "node:" and removes the prefix
    config.plugins = (config.plugins || []).concat([
        new webpack.NormalModuleReplacementPlugin(
            /^node:/,
            (resource) => {
                resource.request = resource.request.replace(/^node:/, "");
            }
        ),
    ]);

    // 3. Ignore source-map warnings from pptxgenjs
    config.ignoreWarnings = [/Failed to parse source map/];

    return config;
};