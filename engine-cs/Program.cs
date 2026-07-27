// Entry point required by the WebAssembly SDK's executable output, but this
// project is consumed purely through JSExport-marked methods (see
// EngineInterop.cs) — JS calls into exported methods directly, it never
// runs Main.
return 0;
