// test-vur.ts
import { VurService } from './src/integrations/vur/client'; // Ret stien her

async function runTest() {
  const bfeNummer = "2073922"; // Indsæt et rigtigt BFE-nummer her
  
  console.log(`--- Starter test for BFE: ${bfeNummer} ---`);
  
  const result = await VurService.getVurdering(bfeNummer);
  
  if (result.fejl) {
    console.error("❌ Fejl under kald:", result.fejl);
  } else {
    console.log("✅ Succes! Modtaget data:");
    console.table(result); // console.table giver et flot overblik
  }
}

runTest().catch(console.error);