/**
 * Barrel-Export aller verfügbaren Such-Quellen.
 *
 * Pages und der globale Cmd-K-Overlay importieren von hier statt direkt
 * aus den Einzeldateien — vereinfacht künftige Erweiterungen (z.B.
 * +resonanzenSource in M4) auf einen Schlag.
 *
 * createChaptersSource ist eine Factory (braucht Ebook-Daten), die
 * anderen sind stateless Singletons.
 */
export { createChaptersSource } from "./chapters";
export { conceptsSource } from "./concepts";
export { philosophersSource } from "./philosophers";
