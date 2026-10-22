// penpair: read
const observation = inspectHelloExample();
return { ok: true, rootId: observation.id, verification: { expected: observation.expected, actual: observation.actual } };
