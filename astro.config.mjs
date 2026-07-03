import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://me.newzone.top",
  output: "static",
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
