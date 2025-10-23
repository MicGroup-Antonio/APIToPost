module.exports = {
  apps: [
    {
      name: "APIToPost",
      script: "npm",
      args: "run serve",
      watch: true,
      env: {
        CONFIG_PATH:"./config/config.local.json",
      },
    },
  ],
};
