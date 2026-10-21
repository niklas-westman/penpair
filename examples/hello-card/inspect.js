// penpair: read
const observation = inspectHelloExample();
if (observation.id && !observation.satisfied) throw new Error("Owned example differs; inspect it before preparing a separate edit");
return { ok: true, ...observation };
