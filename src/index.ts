import snap from "./snap";
import { inlineSnap } from "./inline-snap";

export default Object.assign(snap, {
  inline: inlineSnap,
});

export { mochaHooks } from "./util/store";
