#!/usr/bin/env python3
"""
Script per analizzare la struttura completa dell'agent SGAI
"""
import json
import subprocess
import sys

def get_dsl_from_db():
    """Estrae il DSL dell'agent dal database"""
    cmd = [
        "docker", "exec", "ragflow-mysql",
        "mysql", "-uroot", "-pinfini_rag_flow",
        "-D", "rag_flow",
        "--batch", "--raw", "--skip-column-names",
        "-e", 'SELECT dsl FROM user_canvas WHERE id="a92b7464193811f09d527ebdee58e854";'
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERRORE nell'estrazione DSL: {result.stderr}")
        return None
    
    try:
        return json.loads(result.stdout.strip())
    except Exception as e:
        print(f"ERRORE nel parsing JSON: {e}")
        return None

def analyze_agent(dsl):
    """Analizza la struttura dell'agent"""
    
    print("=" * 100)
    print(" " * 35 + "ANALISI COMPLETA AGENT SGAI")
    print("=" * 100)
    
    components = dsl.get("components", {})
    
    # 1. Statistiche generali
    print("\n### 1. STATISTICHE GENERALI ###\n")
    components_by_type = {}
    for comp_id, comp_data in components.items():
        comp_name = comp_data.get("obj", {}).get("component_name", "Unknown")
        if comp_name not in components_by_type:
            components_by_type[comp_name] = []
        components_by_type[comp_name].append(comp_id)
    
    for comp_type in sorted(components_by_type.keys()):
        comp_ids = components_by_type[comp_type]
        print(f"{comp_type:20s}: {len(comp_ids):2d} componente/i")
    
    # 2. Begin component
    print("\n\n### 2. BEGIN COMPONENT (Entry Point) ###\n")
    begin_data = components.get("begin", {})
    prologue = begin_data.get("obj", {}).get("params", {}).get("prologue", "N/A")
    print(f"Prologue: {prologue[:150]}")
    print(f"Downstream: {begin_data.get('downstream', [])}")
    
    # 3. Answer components
    print("\n\n### 3. ANSWER COMPONENTS (User Interaction) ###\n")
    for comp_id in components_by_type.get("Answer", []):
        comp_data = components[comp_id]
        print(f"\n{comp_id}:")
        print(f"  Upstream:   {comp_data.get('upstream', [])[:5]}")
        print(f"  Downstream: {comp_data.get('downstream', [])}")
    
    # 4. Categorize
    print("\n\n### 4. CATEGORIZE - ROUTING DELLE DOMANDE ###\n")
    for comp_id in components_by_type.get("Categorize", []):
        comp_data = components[comp_id]
        params = comp_data.get("obj", {}).get("params", {})
        categories = params.get("category_description", {})
        
        print(f"\n{comp_id}:")
        print(f"  LLM usato: {params.get('llm_id', 'N/A')}")
        print(f"  Numero categorie: {len(categories)}")
        print(f"\n  Categorie definite:")
        
        for idx, (cat_name, cat_info) in enumerate(categories.items(), 1):
            target = cat_info.get("to", "N/A")
            desc = cat_info.get("description", "")[:120]
            examples = cat_info.get("examples", "")[:80]
            
            print(f"\n    {idx}. [{cat_name}] → {target}")
            print(f"       Quando: {desc}")
            if examples:
                print(f"       Esempi: {examples}...")
    
    # 5. Retrieval components
    print("\n\n### 5. RETRIEVAL COMPONENTS (Knowledge Base) ###\n")
    for comp_id in components_by_type.get("Retrieval", []):
        comp_data = components[comp_id]
        params = comp_data.get("obj", {}).get("params", {})
        
        print(f"\n{comp_id}:")
        print(f"  KB IDs: {params.get('kb_ids', [])}")
        print(f"  Top N: {params.get('top_n', 0)}")
        print(f"  Similarity threshold: {params.get('similarity_threshold', 0)}")
        print(f"  Keywords weight: {params.get('keywords_similarity_weight', 0)}")
        
        empty_resp = params.get("empty_response", "")
        if empty_resp:
            print(f"  Empty response: {empty_resp[:80]}...")
    
    # 6. Generate components
    print("\n\n### 6. GENERATE COMPONENTS (LLM Response Generation) ###\n")
    for idx, comp_id in enumerate(components_by_type.get("Generate", []), 1):
        comp_data = components[comp_id]
        params = comp_data.get("obj", {}).get("params", {})
        upstream = comp_data.get("upstream", [])
        
        # Controlla se ha retrieval upstream
        has_retrieval = any("Retrieval" in u for u in upstream)
        retrieval_count = sum(1 for u in upstream if "Retrieval" in u)
        
        print(f"\n{'='*90}")
        print(f"  GENERATE #{idx}: {comp_id}")
        print(f"{'='*90}")
        print(f"  LLM: {params.get('llm_id', 'N/A')}")
        print(f"  Temperature: {params.get('temperature', 'N/A')}")
        print(f"  Max tokens: {params.get('max_tokens', 0) or 'default'}")
        print(f"  Cite: {params.get('cite', False)}")
        print(f"  Upstream components: {upstream}")
        print(f"  Ha Retrieval: {'✓ SI' if has_retrieval else '✗ NO'} ({retrieval_count} retrieval)")
        
        prompt = params.get("prompt", "")
        print(f"\n  Prompt ({len(prompt)} caratteri):")
        print(f"  {'-'*86}")
        
        # Mostra prime righe del prompt
        lines = prompt.split('\n')[:15]
        for line in lines:
            print(f"  {line[:84]}")
        if len(prompt.split('\n')) > 15:
            print(f"  ... [altre {len(prompt.split('\n')) - 15} righe]")
        print(f"  {'-'*86}")
    
    # 7. Flusso completo
    print("\n\n### 7. FLUSSO COMPLETO DELL'AGENT ###\n")
    print("begin")
    print("  ↓")
    
    begin_downstream = begin_data.get("downstream", [])
    for down in begin_downstream:
        print(f"  {down}")
        if down in components:
            down_data = components[down]
            down_downstream = down_data.get("downstream", [])
            for dd in down_downstream[:3]:
                print(f"    ↓")
                print(f"    {dd}")
                if len(down_downstream) > 3:
                    print(f"    ... e altri {len(down_downstream) - 3}")
                break
    
    # 8. Riepilogo per tipo di query
    print("\n\n### 8. RIEPILOGO: COSA SUCCEDE PER TIPO DI QUERY ###\n")
    
    categorize_comp = next((c for c in components_by_type.get("Categorize", [])), None)
    if categorize_comp:
        categories = components[categorize_comp].get("obj", {}).get("params", {}).get("category_description", {})
        
        for cat_name, cat_info in categories.items():
            target = cat_info.get("to", "N/A")
            target_data = components.get(target, {})
            target_type = target_data.get("obj", {}).get("component_name", "Unknown")
            
            print(f"\n  Query tipo: {cat_name}")
            print(f"    → Va a: {target} ({target_type})")
            
            if target_type == "Generate":
                target_upstream = target_data.get("upstream", [])
                has_ret = any("Retrieval" in u for u in target_upstream)
                print(f"    → Usa Retrieval: {'SI' if has_ret else 'NO'}")
                if has_ret:
                    ret_comps = [u for u in target_upstream if "Retrieval" in u]
                    print(f"    → Retrieval components: {ret_comps}")
    
    print("\n" + "=" * 100)
    print("\nAnalisi completata!")
    print("\nDSL completo salvato in: /tmp/sgai_dsl_complete.json")
    
    # Salva DSL completo
    with open("/tmp/sgai_dsl_complete.json", "w") as f:
        json.dump(dsl, f, indent=2)

if __name__ == "__main__":
    print("Estrazione DSL dal database...")
    dsl = get_dsl_from_db()
    
    if dsl:
        analyze_agent(dsl)
    else:
        print("ERRORE: Impossibile estrarre il DSL")
        sys.exit(1)

