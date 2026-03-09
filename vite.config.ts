import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  base: "/black-hole-simulator/",
  plugins: [
    glsl({
      include: [
        "**/*.glsl",
        "**/*.vert",
        "**/*.frag",
        "**/*.vs",
        "**/*.fs"
      ]
    })
  ]
});
