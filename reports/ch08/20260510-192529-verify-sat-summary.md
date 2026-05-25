# SAT Verification Summary — `20260510-192529`

Ten plik streszcza wyniki walidacji `SAT` dla batcha `20260510-192529`.
Pełne artefakty źródłowe znajdują się w:

- `reports/verify-sat-from-ch08.json`
- `reports/verify-sat-from-ch08.md`

Źródło przypadków `SAT`:

- `reports/ch08/20260510-192529-solve.json`

## Wyniki

- Total cases: `967`
- Verified SAT: `890`
- False SAT: `72`
- Non-SAT: `0`
- Errors: `5`

## Interpretacja operacyjna

- `Verified SAT` oznacza przypadek, w którym `npm install --package-lock-only` zaakceptował
  dokładne przypisanie wersji zwrócone przez solver.
- `False SAT` oznacza przypadek, w którym solver zwrócił `SAT`, ale npm zgłosił konflikt dla
  tego przypisania.
- `Non-SAT` oznacza przypadek odfiltrowany przez raport solve jako inny niż `SAT`; dla tego
  batcha liczba takich przypadków wynosi `0`, ponieważ walidacja obejmuje wyłącznie przypadki
  `SAT` z raportu `solve`.
- `Errors` oznacza przypadki zakończone błędem innym niż rozpoznany konflikt peer.
