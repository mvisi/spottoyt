import { App } from "./App";

(globalThis as { __spottoytRender?: () => JSX.Element }).__spottoytRender =
  () => <App />;
