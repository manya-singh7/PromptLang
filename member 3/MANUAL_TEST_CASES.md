# Manual test cases

Run `npm start` from this folder and open `http://127.0.0.1:4174`. Mock mode is the default and makes no API call. These cases can be run without a provider key.

## 1. Page starts blank

When the page first opens, both the Chain and Input text boxes should be empty. The example text is only a placeholder.

## 2. One valid step

Chain:

```text
step summarize: in=text, out=text
```

Input:

```text
Summarize this article in one sentence.
```

Click **Check first**. Expected: a mock text result, the estimated token counts and price, and a message that mock mode made no API call or charge.

## 3. Two valid steps

Chain:

```text
step summarize: in=text, out=text -> step format: in=text, out=list
```

Input: `Summarize this article.`

Click **Check first**. Expected: it runs both steps and the final output is a mock list.

## 4. Type mismatch

Chain:

```text
step make_json: in=text, out=json -> step email: in=text, out=text
```

Click **Check first**. Expected: a message says `make_json` outputs `json` while `email` expects `text`; the steps do not run.

## 5. Safe list-to-text fix

Chain:

```text
step format: in=text, out=list -> step summarize: in=text, out=text
```

Click **Check first**. Expected: it inserts the list-to-text adapter and returns a mock text result.

## 6. Text output limit

Chain:

```text
step shorten: in=text, out=text[max 5]
```

Input: `A longer input sentence.`

Click **Check first**. Expected: the mock output is shortened to at most five characters.

## 7. Input length limit

Chain:

```text
step shorten: in=text[max 3], out=text
```

Input: `This is longer than three characters.`

Click **Check first**. Expected: a runtime error says the input is longer than the three-character limit.

## 8. Invalid limit syntax

Chain:

```text
step broken: in=text[max 0], out=text
```

Click either button. Expected: a syntax message says the text limit must be a positive whole number.

## 9. Dangling arrow

Chain:

```text
step first: in=text, out=text ->
```

Click either button. Expected: a parse error says another step was expected after the arrow.

## 10. Estimate changes

Try the same one-step chain with a short input, then a much longer input. Expected: estimated input token count and price increase. Add a second step and expected output tokens and price should increase. Add `out=text[max 10]` and the estimated output size should decrease.

The mock estimate uses example rates, not actual provider charges. Real API mode needs the team's own API key and current provider prices.
