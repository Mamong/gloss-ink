"use strict";

class ComponentError extends Error {
  constructor(message, {code = 'COMPONENT_ERROR', cause} = {}) {
    super(message, {cause});
    this.name = 'ComponentError';
    this.code = code;
  }
}

module.exports = ComponentError;
