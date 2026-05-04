import re

html_path = '/home/administrador/Documentos/control-decklink/static/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Extract card 1
card1_match = re.search(r'(<!-- CONFIG: CH1 -->.*?<button id="btnPreview_1".*?</div>\s*</div>)', content, re.DOTALL)
if not card1_match:
    print("Could not find CH1")
    exit(1)

card1_html = card1_match.group(1)

# Generate CH2, CH3, CH4
cards_html = [card1_html]
colors = {"1": "text-red-500", "2": "text-blue-500", "3": "text-green-500", "4": "text-fuchsia-500"}
for i in range(2, 5):
    ch_str = str(i)
    new_card = card1_html.replace('CH1', f'CH{ch_str}')
    new_card = new_card.replace('_1', f'_{ch_str}')
    new_card = new_card.replace("('1'", f"('{ch_str}'")
    new_card = new_card.replace("('1',", f"('{ch_str}',")
    new_card = new_card.replace('(1)', f'({ch_str})')
    # fix the color
    new_card = new_card.replace('text-red-500', colors[ch_str])
    # fix the card IDs
    cards_html.append(new_card)

all_cards = "\n\n".join(cards_html)

# Since we have a mess between CH1 and the end of gridCards, we will find <!-- CONFIG: CH1 --> until </div><!-- /gridCards -->
pattern = r'<!-- CONFIG: CH1 -->.*?</div><!-- /gridCards -->'
replacement = all_cards + '\n\n            </div><!-- /gridCards -->'

if re.search(pattern, content, re.DOTALL):
    new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Fixed layout of cards successfully.")
else:
    print("Could not match the block to replace.")

