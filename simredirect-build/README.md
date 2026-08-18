# SIM Redirect

Utility Android per deviare una singola chiamata in entrata solo quando:

- arriva sulla SIM/subscription selezionata;
- il numero non è presente in rubrica (oppure è privato/non identificato);
- la funzione è attiva;
- modem e operatore espongono `CAPABILITY_SUPPORT_DEFLECT`.

L'app non abilita mai l'inoltro globale della SIM come fallback.

## Uso

1. Installa l'APK debug.
2. Concedi Telefono, Contatti e Chiamate.
3. Seleziona la SIM e inserisci il numero di destinazione.
4. Attiva e salva.
5. Tocca **Imposta come app Telefono** e conferma il ruolo Android.

Per poter ricevere l'oggetto `android.telecom.Call` e chiamare `Call.deflect(...)`, Android richiede il ruolo di app Telefono predefinita; per questo il progetto include anche una UI chiamata minimale per rispondere/rifiutare/chiudere, vivavoce e muto.
