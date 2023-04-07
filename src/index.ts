import createSnap from "./snap";
import createInlineSnap from "./inline-snap";

export default Object.assign(createSnap(false), {
  catch: createSnap(true),
  inline: Object.assign(createInlineSnap(false), {
    catch: createInlineSnap(true),
  }),
});

export { mochaHooks } from "./util/store";
