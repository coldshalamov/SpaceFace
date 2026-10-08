// One named actor's existing-system materializer, invoked before physics just like other machinery.
const owners=new WeakMap();
export function registerLatchMaterializer(state,owner){owners.set(state,owner);}
export function unregisterLatchMaterializer(state,owner){if(owners.get(state)===owner)owners.delete(state);}
export function reconcileLatchBeforePhysics(state){owners.get(state)?.sync();}
