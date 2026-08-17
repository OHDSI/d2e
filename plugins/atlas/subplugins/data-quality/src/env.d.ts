interface Window {
  System: {
    import: (id: string) => Promise<unknown>;
  };
}
