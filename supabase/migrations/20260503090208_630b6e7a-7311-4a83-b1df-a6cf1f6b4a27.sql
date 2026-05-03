-- address_analysis er en delt cache (samme adresse → samme analyseresultat),
-- skrevet udelukkende af server-koden via service role (bypasser RLS).
-- Med RLS aktiveret og ingen policies kan anon/authenticated klienter ikke læse cachen direkte.
-- Vi tilføjer en eksplicit læse-policy så authenticated brugere kan slå cachen op fra klienten,
-- mens al skrivning fortsat kun sker server-side.

CREATE POLICY "Authenticated users can read address cache"
ON public.address_analysis
FOR SELECT
TO authenticated
USING (true);
