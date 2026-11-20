const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The app reuses the web's pure rule files; Metro bundles only folders it watches.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../web/lib')];

module.exports = config;
