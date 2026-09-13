/* @refresh reload */
import { render } from "solid-js/web";
import "../styles/theme.css";
import { App } from "./app";

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
