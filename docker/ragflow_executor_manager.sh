#!/bin/bash
# ragflow_executor_manager.sh - Gestore completo per RagFlow executors (CPU-only version)

# Configurazione (modifica questi valori secondo le tue necessità)
MAX_EXECUTORS=50          # Limite massimo di executor totali
BATCH_SIZE=1              # Aggiungi executor uno alla volta (MODIFICATO)
WAIT_TIME=60              # Attendi 60 secondi tra executor (MODIFICATO)
TARGET_CPU_UTIL=85        # Target utilizzo CPU (%)
MIN_CPU_FREE=15           # Minimo CPU libera richiesta (%)
MIN_RAM_FREE=20           # Minimo RAM libera richiesta (%)

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funzione per stampare con colori
print_color() {
    color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Funzione per ottenere numero di executor correnti
get_current_executors() {
    docker exec ragflow-server ps aux | grep task_executor | grep -v grep | wc -l
}

# Funzione per controllare le risorse
check_resources() {
    # CPU - Versione corretta che misura l'uso effettivo
    CPU_IDLE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print int($1)}')
    CPU_USAGE=$((100 - CPU_IDLE))
    
    # RAM
    RAM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
    
    print_color $YELLOW "CPU: ${CPU_USAGE}% used"
    print_color $YELLOW "RAM: ${RAM_USAGE}% used"
    
    # Controlla se è sicuro continuare
    if [ "$CPU_USAGE" -gt "$TARGET_CPU_UTIL" ]; then
        return 1
    fi
    
    if [ "$CPU_USAGE" -gt $((100 - MIN_CPU_FREE)) ]; then
        return 1
    fi
    
    if [ "$RAM_USAGE" -gt $((100 - MIN_RAM_FREE)) ]; then
        return 1
    fi
    
    return 0
}

# Funzione per mostrare lo status
show_status() {
    print_color $GREEN "\n=== EXECUTOR STATUS ==="
    docker exec ragflow-server ps aux | grep task_executor | grep -v grep | awk '{print $2, $11, $12, $13}'
    print_color $YELLOW "Totale executor: $(get_current_executors)"
    
    print_color $GREEN "\n=== SYSTEM RESOURCES ==="
    check_resources
    
    # Mostra info CPU dettagliate
    print_color $GREEN "\n=== CPU DETAILS ==="
    lscpu | grep -E 'CPU\(s\)|Thread|Core|Socket'
}

# Funzione per scale up sicuro
scale_up() {
    print_color $GREEN "Starting safe executor scaling (one at a time)..."
    CURRENT_EXECUTORS=$(get_current_executors)
    print_color $YELLOW "Executor iniziali: $CURRENT_EXECUTORS"
    
    while [ "$CURRENT_EXECUTORS" -lt "$MAX_EXECUTORS" ]; do
        echo "----------------------------------------"
        print_color $YELLOW "Controllo risorse..."
        
        if ! check_resources; then
            print_color $RED "Limiti risorse raggiunti. Stop."
            break
        fi
        
        # Aggiungi UN executor alla volta
        CURRENT_EXECUTORS=$((CURRENT_EXECUTORS + 1))
        print_color $GREEN "Avvio executor $CURRENT_EXECUTORS..."
        
        if docker exec -d ragflow-server python /ragflow/rag/svr/task_executor.py $CURRENT_EXECUTORS; then
            print_color $GREEN "✓ Executor $CURRENT_EXECUTORS avviato con successo"
            print_color $YELLOW "Attesa di $WAIT_TIME secondi per test stabilità..."
            
            # Conta alla rovescia visuale
            for i in $(seq $WAIT_TIME -1 1); do
                printf "\rAttesa: %2d secondi rimanenti..." $i
                sleep 1
            done
            printf "\n"
            
            # Verifica che l'executor sia ancora attivo
            actual_executors=$(get_current_executors)
            if [ "$actual_executors" -lt "$CURRENT_EXECUTORS" ]; then
                print_color $RED "ATTENZIONE: L'executor appena avviato è crashato!"
                print_color $RED "Previsti: $CURRENT_EXECUTORS, Attivi: $actual_executors"
                CURRENT_EXECUTORS=$actual_executors
                
                print_color $RED "Possibile instabilità del sistema. Interruzione scaling."
                break
            else
                print_color $GREEN "✓ Executor $CURRENT_EXECUTORS verificato e stabile"
                print_color $YELLOW "Executor attivi: $CURRENT_EXECUTORS/$MAX_EXECUTORS"
            fi
        else
            print_color $RED "Errore nell'avvio dell'executor $CURRENT_EXECUTORS"
            CURRENT_EXECUTORS=$((CURRENT_EXECUTORS - 1))
            print_color $RED "Interruzione scaling a causa di errore."
            break
        fi
        
        # Mostra risorse dopo ogni executor
        echo
        check_resources
        echo
    done
    
    print_color $GREEN "\n=== SCALING COMPLETATO ==="
    show_status
}

# Funzione per rimuovere tutti gli executor extra
kill_all_executors() {
    print_color $YELLOW "Terminazione di tutti gli executor extra..."
    docker exec ragflow-server pkill -f "task_executor.py [0-9]"
    sleep 5
    print_color $GREEN "Executor rimanenti: $(get_current_executors)"
}

# Funzione per monitoraggio live
monitor_live() {
    watch -n 2 '
        echo -e "\033[0;32m=== RAGFLOW EXECUTOR MONITOR (CPU-Only) ===\033[0m"
        echo -e "\033[1;33mTotal executors: $(docker exec ragflow-server ps aux | grep task_executor | grep -v grep | wc -l)\033[0m"
        echo
        echo -e "\033[0;32m=== SYSTEM RESOURCES ===\033[0m"
        # CPU misurazione corretta
        CPU_IDLE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk "{print int(\$1)}")
        CPU_USAGE=$((100 - CPU_IDLE))
        echo "CPU: ${CPU_USAGE}% used"
        echo -n "RAM: "; free -h | grep Mem | awk "{print \$3\" / \"\$2}"
        echo
        echo -e "\033[0;32m=== TOP PROCESSES ===\033[0m"
        docker exec ragflow-server ps aux --sort=-%cpu | head -5
    '
}

# Menu principale
main_menu() {
    while true; do
        clear
        print_color $GREEN "
╔════════════════════════════════════════════╗
║     RAGFLOW EXECUTOR MANAGER v2.1          ║
║            (CPU-Only Edition)              ║
╚════════════════════════════════════════════╝

1) Mostra stato attuale
2) Avvia scaling automatico (1 executor/minuto)
3) Termina tutti gli executor extra
4) Monitor live
5) Configurazione
6) Esci

"
        read -p "Seleziona opzione [1-6]: " choice
        
        case $choice in
            1) 
                clear
                show_status
                read -p "Premi ENTER per continuare..."
                ;;
            2)
                clear
                scale_up
                read -p "Premi ENTER per continuare..."
                ;;
            3)
                clear
                kill_all_executors
                read -p "Premi ENTER per continuare..."
                ;;
            4)
                clear
                monitor_live
                ;;
            5)
                clear
                print_color $GREEN "=== CONFIGURAZIONE ATTUALE ==="
                echo "MAX_EXECUTORS=$MAX_EXECUTORS"
                echo "BATCH_SIZE=$BATCH_SIZE (executors per ciclo)"
                echo "WAIT_TIME=$WAIT_TIME secondi"
                echo "TARGET_CPU_UTIL=$TARGET_CPU_UTIL%"
                echo "MIN_CPU_FREE=$MIN_CPU_FREE%"
                echo "MIN_RAM_FREE=$MIN_RAM_FREE%"
                print_color $YELLOW "\nModifica direttamente lo script per cambiare questi valori."
                read -p "Premi ENTER per continuare..."
                ;;
            6)
                print_color $GREEN "Arrivederci!"
                exit 0
                ;;
            *)
                print_color $RED "Opzione non valida!"
                sleep 1
                ;;
        esac
    done
}

# Controlla prerequisiti
check_prerequisites() {
    # Controlla se Docker è installato
    if ! command -v docker &> /dev/null; then
        print_color $RED "Docker non trovato! Installa Docker prima di continuare."
        exit 1
    fi
    
    # Controlla se il container ragflow-server è in esecuzione
    if ! docker ps | grep -q ragflow-server; then
        print_color $RED "Container ragflow-server non trovato! Assicurati che sia in esecuzione."
        exit 1
    fi
}

# Main
main() {
    check_prerequisites
    
    # Se viene passato un parametro, esegui direttamente l'azione
    case "$1" in
        status)
            show_status
            ;;
        scale)
            scale_up
            ;;
        kill)
            kill_all_executors
            ;;
        monitor)
            monitor_live
            ;;
        *)
            # Nessun parametro, mostra il menu
            main_menu
            ;;
    esac
}

# Avvia lo script
main $1