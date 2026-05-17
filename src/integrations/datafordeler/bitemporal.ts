export type DatafordelerBitemporalArgs = {
  virkningstid: string;
  registreringstid: string;
};

export function currentBitemporalArgs(now = new Date()): DatafordelerBitemporalArgs {
  const timestamp = now.toISOString();
  return {
    virkningstid: timestamp,
    registreringstid: timestamp,
  };
}
