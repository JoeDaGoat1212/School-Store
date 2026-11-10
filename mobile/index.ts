import { registerRootComponent } from "expo";
import App from "./App";
// Defines the background message check before the app starts.
import "./src/notify";

registerRootComponent(App);
