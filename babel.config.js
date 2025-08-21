// babel.config.js  ✅ FINAL
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      "babel-preset-expo",
      "nativewind/babel",               // ← as PRESET
    ],
    plugins: [
      "react-native-reanimated/plugin", // MUST be last
    ],
  };
};
