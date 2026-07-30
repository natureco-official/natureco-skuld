'use strict';

const { getSkuldPaths } = require('../utils/skuld-paths');

module.exports = {
  name: 'skuld_system',
  description: 'Skuld uygulamasının kendi kurulum, kaynak, araç, skill, yapılandırma ve log yollarını gösterir.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute() {
    return { success: true, ...getSkuldPaths() };
  },
};
