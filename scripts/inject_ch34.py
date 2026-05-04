import os, re

def process_index_html():
    filepath = '/home/administrador/Documentos/control-decklink/static/index.html'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add btnRoleG3Label and btnRoleG4Label
    content = content.replace(
        '<span id="btnRoleG2Label" class="hidden">Capturadora2.0II</span>',
        '<span id="btnRoleG2Label" class="hidden">Capturadora2.0II</span>\n                <span id="btnRoleG3Label" class="hidden">Capturadora2.0III</span>\n                <span id="btnRoleG4Label" class="hidden">Capturadora2.0IV</span>'
    )

    # 2. Add badgeCH3 and CH4
    content = content.replace(
        '''<div id="badgeCH2"
                            class="px-3 py-1 rounded border border-slate-700/50 bg-slate-800/60 text-slate-400 font-bold text-[10px] tracking-widest shadow-inner transition-colors duration-300">
                            GRABANDO 2</div>''',
        '''<div id="badgeCH2"
                            class="px-3 py-1 rounded border border-slate-700/50 bg-slate-800/60 text-slate-400 font-bold text-[10px] tracking-widest shadow-inner transition-colors duration-300">
                            GRABANDO 2</div>
                        <div id="badgeCH3"
                            class="px-3 py-1 rounded border border-slate-700/50 bg-slate-800/60 text-slate-400 font-bold text-[10px] tracking-widest shadow-inner transition-colors duration-300">
                            GRABANDO 3</div>
                        <div id="badgeCH4"
                            class="px-3 py-1 rounded border border-slate-700/50 bg-slate-800/60 text-slate-400 font-bold text-[10px] tracking-widest shadow-inner transition-colors duration-300">
                            GRABANDO 4</div>'''
    )

    # 3. Add cardCH3 and cardCH4
    # First, extract cardCH2
    card2_match = re.search(r'<!-- CONFIG: CH2 -->.*?</div>\s*</div>', content, re.DOTALL)
    if card2_match:
        card2_html = card2_match.group(0)
        card3_html = card2_html.replace('CH2', 'CH3').replace('_2', '_3').replace("('2'", "('3'").replace('Duo (2)', 'Duo (3)').replace('blue-500', 'green-500').replace('blue-700', 'green-700').replace('blue-900', 'green-900').replace('titleCH2', 'titleCH3').replace('durationVal_2', 'durationVal_3')
        card4_html = card2_html.replace('CH2', 'CH4').replace('_2', '_4').replace("('2'", "('4'").replace('Duo (2)', 'Duo (4)').replace('blue-500', 'fuchsia-500').replace('blue-700', 'fuchsia-700').replace('blue-900', 'fuchsia-900').replace('titleCH2', 'titleCH4').replace('durationVal_2', 'durationVal_4')
        # Insert them right after card2
        content = content[:card2_match.end()] + "\n\n" + card3_html + "\n\n" + card4_html + content[card2_match.end():]

    # 4. Add logBox_3 and logBox_4
    log2_match = re.search(r'<div class="flex flex-col">\s*<p class="text-\[10px\].*?DeckLink \(2\).*?</div>\s*</div>', content, re.DOTALL)
    if log2_match:
        log2_html = log2_match.group(0)
        # Fix grid cols to md:grid-cols-2 or md:grid-cols-4 
        content = content.replace('grid-cols-1 md:grid-cols-2 gap-6', 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6')
        
        log3_html = log2_html.replace('DeckLink (2)', 'DeckLink (3)').replace('logSize_2', 'logSize_3').replace('logBox_2', 'logBox_3').replace('text-[#60a5fa]', 'text-[#4ade80]')
        log4_html = log2_html.replace('DeckLink (2)', 'DeckLink (4)').replace('logSize_2', 'logSize_4').replace('logBox_2', 'logBox_4').replace('text-[#60a5fa]', 'text-[#f472b6]')
        content = content[:log2_match.end()] + "\n" + log3_html + "\n" + log4_html + content[log2_match.end():]

    # 5. Admin modal
    # Groups
    group2_input = r'''                    <div>
                        <label class="block text-\[9px\] font-bold text-cyan-400 mb-1 uppercase">Grupo 2 \(Canal 2\)</label>
                        <input type="text" id="inputG2Name" placeholder="Capturadora2.0II"
                            class="w-full p-3 rounded-xl outline-none font-mono text-sm bg-slate-900 border border-cyan-700/50 focus:border-cyan-400 text-white transition-all" />
                    </div>'''
    
    group3_input = group2_input.replace('Grupo 2 (Canal 2)', 'Grupo 3 (Canal 3)').replace('inputG2Name', 'inputG3Name').replace('Capturadora2.0II', 'Capturadora2.0III').replace('cyan-400', 'green-400').replace('cyan-700', 'green-700')
    group4_input = group2_input.replace('Grupo 2 (Canal 2)', 'Grupo 4 (Canal 4)').replace('inputG2Name', 'inputG4Name').replace('Capturadora2.0II', 'Capturadora2.0IV').replace('cyan-400', 'fuchsia-400').replace('cyan-700', 'fuchsia-700')
    
    if re.search(group2_input, content):
        content = re.sub(group2_input, group2_input + "\n" + group3_input + "\n" + group4_input, content)

    # User Select
    opt2 = '<option value="2" id="newUserGroupOpt2">Grupo 2 — Capturadora2.0II</option>'
    opt3 = '<option value="3" id="newUserGroupOpt3">Grupo 3 — Capturadora2.0III</option>'
    opt4 = '<option value="4" id="newUserGroupOpt4">Grupo 4 — Capturadora2.0IV</option>'
    content = content.replace(opt2, opt2 + "\n" + opt3 + "\n" + opt4)

    # 6. Change grid elements count
    content = content.replace('grid-template-columns: 1fr 1fr 260px;', 'grid-template-columns: 1fr 1fr 1fr 1fr 260px;')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("index.html updated successfully.")

def process_dashboard_js():
    filepath = '/home/administrador/Documentos/control-decklink/static/js/dashboard.js'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace("['1', '2'].forEach", "['1', '2', '3', '4'].forEach")
    content = content.replace("!document.getElementById('logBox_1').textContent && !document.getElementById('logBox_2').textContent",
                              "!document.getElementById('logBox_1').textContent && !document.getElementById('logBox_2').textContent && !document.getElementById('logBox_3')?.textContent && !document.getElementById('logBox_4')?.textContent")
    
    # 1. Update Metrics bitrate calculus
    rep_from = """                let br1 = document.getElementById('bitrate_1')?.value || "15M";
                let br2 = document.getElementById('bitrate_2')?.value || "15M";
                let num1 = parseInt(br1.replace('M',''));
                let num2 = parseInt(br2.replace('M',''));
                
                let isC1Running = channels['1']?.running ? 1 : 0;
                let isC2Running = channels['2']?.running ? 1 : 0;
                
                let activeBitrateMbps = (num1 * isC1Running) + (num2 * isC2Running);"""
    
    rep_to = """                let br1 = document.getElementById('bitrate_1')?.value || "15M";
                let br2 = document.getElementById('bitrate_2')?.value || "15M";
                let br3 = document.getElementById('bitrate_3')?.value || "15M";
                let br4 = document.getElementById('bitrate_4')?.value || "15M";
                let num1 = parseInt(br1.replace('M',''));
                let num2 = parseInt(br2.replace('M',''));
                let num3 = parseInt(br3.replace('M',''));
                let num4 = parseInt(br4.replace('M',''));
                
                let isC1Running = channels['1']?.running ? 1 : 0;
                let isC2Running = channels['2']?.running ? 1 : 0;
                let isC3Running = channels['3']?.running ? 1 : 0;
                let isC4Running = channels['4']?.running ? 1 : 0;
                
                let activeBitrateMbps = (num1 * isC1Running) + (num2 * isC2Running) + (num3 * isC3Running) + (num4 * isC4Running);"""
    content = content.replace(rep_from, rep_to)
    
    # freeGB < 50
    content = content.replace(
        "if (freeGB < 50 && (isC1Running + isC2Running) > 0) playErrorBeep();",
        "if (freeGB < 50 && (isC1Running + isC2Running + isC3Running + isC4Running) > 0) playErrorBeep();"
    )

    # 2. Update status fetch
    sf_from = """                const [r1, r2] = await Promise.all([
                    fetch('/api/status/1', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/2', { headers: { 'X-Token': TOKEN } })
                ]);
                if (!r1.ok || !r2.ok) { onNetFail(); return; }

                applyStatusData('1', await r1.json());
                applyStatusData('2', await r2.json());"""
                
    sf_to = """                const [r1, r2, r3, r4] = await Promise.all([
                    fetch('/api/status/1', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/2', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/3', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/4', { headers: { 'X-Token': TOKEN } })
                ]);
                if (!r1.ok || !r2.ok || !r3.ok || !r4.ok) { onNetFail(); return; }

                applyStatusData('1', await r1.json());
                applyStatusData('2', await r2.json());
                applyStatusData('3', await r3.json());
                applyStatusData('4', await r4.json());"""
    content = content.replace(sf_from, sf_to)

    # applyChannelFilter
    acf_from = """            if (!USER_CHANNEL) return;
            // Ocultar la tarjeta del canal que NO pertenece al grupo
            const hiddenCh = USER_CHANNEL === '1' ? '2' : '1';

            // Ocultar la tarjeta del canal ajeno mediante su ID estricto
            const card = document.getElementById(`cardCH${hiddenCh}`);
            if (card) card.classList.add('hidden');

            // Ocultar el badge del canal ajeno en el header
            const badge = document.getElementById(`badgeCH${hiddenCh}`);
            if (badge) badge.classList.add('hidden');

            // Ocultar el log del canal ajeno
            const logSection = document.querySelector(`#logBox_${hiddenCh}`)?.closest('.flex.flex-col');
            if (logSection) logSection.classList.add('hidden');"""
    
    acf_to = """            if (!USER_CHANNEL) return;
            ['1', '2', '3', '4'].forEach(ch => {
                if(ch !== USER_CHANNEL) {
                    const card = document.getElementById(`cardCH${ch}`);
                    if (card) card.classList.add('hidden');
                    const badge = document.getElementById(`badgeCH${ch}`);
                    if (badge) badge.classList.add('hidden');
                    const logSection = document.querySelector(`#logBox_${ch}`)?.closest('.flex.flex-col');
                    if (logSection) logSection.classList.add('hidden');
                }
            });"""
    content = content.replace(acf_from, acf_to)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("dashboard.js updated successfully.")

process_index_html()
process_dashboard_js()
