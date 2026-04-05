import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  BookOpen, 
  Code2, 
  Terminal, 
  History, 
  Save, 
  Trash2, 
  ChevronRight, 
  Info, 
  Sparkles,
  Loader2,
  Copy,
  Check,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';

// --- Types ---
interface SavedCode {
  id: string;
  title: string;
  code: string;
  timestamp: number;
}

// --- Constants ---
const HASKELL_TEMPLATES = [
  {
    id: 'hello',
    title: 'Hello World',
    code: 'main = putStrLn "Olá, Haskell!"'
  },
  {
    id: 'reserved',
    title: 'Palavras Reservadas',
    code: '-- Exemplo de Palavras Reservadas e Operadores\nmodule Main where\n\nimport Data.List (sort)\n\ndata Cor = Verde | Azul | Vermelho deriving (Show, Eq)\n\ntype Nome = String\n\nclass Animado a where\n  mover :: a -> a\n\ninstance Animado Cor where\n  mover Verde = Azul\n  mover Azul = Vermelho\n  mover Vermelho = Verde\n\nmain :: IO ()\nmain = do\n  let lista = [3, 1, 2]\n  if null lista\n    then putStrLn "Vazia"\n    else print (sort lista)\n\n  case Verde of\n    Verde -> putStrLn "É verde!"\n    _     -> putStrLn "Outra cor"'
  },
  {
    id: 'factorial',
    title: 'Fatorial (Recursão)',
    code: 'fatorial :: Integer -> Integer\nfatorial 0 = 1\nfatorial n = n * fatorial (n - 1)\n\nmain = print (fatorial 5)'
  },
  {
    id: 'map-filter',
    title: 'Map & Filter',
    code: 'dobro x = x * 2\néPar x = x `mod` 2 == 0\n\nmain = do\n  let lista = [1..10]\n  let pares = filter éPar lista\n  let dobrados = map dobro pares\n  print dobrados'
  },
  {
    id: 'fibonacci',
    title: 'Fibonacci (Lazy)',
    code: 'fibs = 0 : 1 : zipWith (+) fibs (tail fibs)\n\nmain = print (take 10 fibs)'
  },
  {
    id: 'quicksort',
    title: 'QuickSort',
    code: 'quicksort :: Ord a => [a] -> [a]\nquicksort [] = []\nquicksort (x:xs) = \n    let smaller = quicksort [a | a <- xs, a <= x]\n        bigger = quicksort [a | a <- xs, a > x]\n    in  smaller ++ [x] ++ bigger\n\nmain = print (quicksort [5, 2, 9, 1, 5, 6])'
  }
];

const INITIAL_CODE = HASKELL_TEMPLATES[0].code;

const HASKELL_SUGGESTIONS = [
  // Keywords
  'module', 'import', 'where', 'let', 'in', 'case', 'of', 'if', 'then', 'else', 'do', 
  'type', 'data', 'newtype', 'class', 'instance', 'deriving', 'as', 'qualified', 'hiding',
  'main', 'return',
  // Types
  'Int', 'Integer', 'Float', 'Double', 'Bool', 'Char', 'String', 'IO', 'Maybe', 'Either', 'Ordering',
  // Functions
  'putStrLn', 'print', 'getLine', 'read', 'show', 'head', 'tail', 'last', 'init', 'null', 
  'length', 'reverse', 'map', 'filter', 'foldl', 'foldr', 'zip', 'zipWith', 'take', 'drop', 
  'splitAt', 'takeWhile', 'dropWhile', 'any', 'all', 'elem', 'notElem', 'sum', 'product', 
  'maximum', 'minimum', 'concat', 'concatMap', 'words', 'unwords', 'lines', 'unlines',
  'undefined', 'error', 'otherwise'
];

// --- Syntax Highlighting Logic ---
const highlightHaskell = (code: string) => {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Regex for all tokens: comments, strings, keywords, operators, numbers, and types (starting with uppercase)
  const tokenRegex = /(--.*$)|({-[\s\S]*?-})|(".*?")|(\b(?:module|import|where|let|in|case|of|if|then|else|do|type|data|newtype|class|instance|deriving|as|qualified|hiding)\b)|(->|<-|=>|::|==|<=|>=|\.\.|[:=\|\\@~+\-*/><])|(\b\d+\b)|(\b[A-Z][a-zA-Z0-9_']*\b)/gm;

  let lastIndex = 0;
  let html = '';
  let match;

  // Reset regex index for safety
  tokenRegex.lastIndex = 0;

  while ((match = tokenRegex.exec(code)) !== null) {
    // Add escaped plain text before the match
    html += escape(code.substring(lastIndex, match.index));
    
    const [full, comment1, comment2, str, kw, op, num, typeName] = match;
    const text = escape(full);

    if (comment1 || comment2) {
      html += `<span class="text-slate-500 italic">${text}</span>`;
    } else if (str) {
      html += `<span class="text-emerald-400">${text}</span>`;
    } else if (kw) {
      html += `<span class="text-indigo-400 font-bold">${text}</span>`;
    } else if (typeName) {
      html += `<span class="text-cyan-400">${text}</span>`;
    } else if (op) {
      html += `<span class="text-pink-400">${text}</span>`;
    } else if (num) {
      html += `<span class="text-amber-400">${text}</span>`;
    } else {
      html += text;
    }

    lastIndex = tokenRegex.lastIndex;
  }

  // Add remaining escaped plain text
  html += escape(code.substring(lastIndex));
  
  return html;
};

// --- App Component ---
export default function App() {
  const [code, setCode] = useState(HASKELL_TEMPLATES[0].code);
  const [output, setOutput] = useState<string>('');
  const [replHistory, setReplHistory] = useState<{ type: 'input' | 'output' | 'error', content: string }[]>([]);
  const [replInput, setReplInput] = useState('');
  const [explanation, setExplanation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReplLoading, setIsReplLoading] = useState(false);
  const [savedCodes, setSavedCodes] = useState<SavedCode[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeLine, setActiveLine] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replHistory, output]);

  // Sync scroll between textarea, line numbers, and highlighted pre
  const handleScroll = () => {
    if (textareaRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = scrollTop;
      if (preRef.current) {
        preRef.current.scrollTop = scrollTop;
        preRef.current.scrollLeft = scrollLeft;
      }
    }
  };

  const lineCount = code.split('\n').length;

  // Autocomplete Logic
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      const cursor = textarea.selectionStart;
      const textBefore = code.substring(0, cursor);
      const match = textBefore.match(/(\b[a-zA-Z0-9_']+)$/);

      if (match) {
        const prefix = match[1];
        const filtered = HASKELL_SUGGESTIONS.filter(s => 
          s.startsWith(prefix) && s !== prefix
        ).slice(0, 10);

        if (filtered.length > 0) {
          // Calculate position (rough approximation for monospaced font)
          const lines = textBefore.split('\n');
          const currentLineIndex = lines.length - 1;
          const currentColIndex = lines[currentLineIndex].length;
          
          setSuggestions(filtered);
          setSuggestionIndex(0);
          setSuggestionPos({
            top: (currentLineIndex + 1) * 24 + 24 - textarea.scrollTop, // 24px is leading-6
            left: currentColIndex * 8.4 + 56 - textarea.scrollLeft // 56px is line numbers width
          });
        } else {
          setSuggestions([]);
        }
      } else {
        setSuggestions([]);
      }
    };

    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('click', () => {
      setSuggestions([]);
      const cursor = textarea.selectionStart;
      const textBefore = code.substring(0, cursor);
      setActiveLine(textBefore.split('\n').length - 1);
    });
    textarea.addEventListener('keyup', () => {
      const cursor = textarea.selectionStart;
      const textBefore = code.substring(0, cursor);
      setActiveLine(textBefore.split('\n').length - 1);
    });
    return () => {
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('click', () => setSuggestions([]));
      textarea.removeEventListener('keyup', () => {});
    };
  }, [code]);

  const insertSuggestion = (suggestion: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart;
    const textBefore = code.substring(0, cursor);
    const match = textBefore.match(/(\b[a-zA-Z0-9_']+)$/);

    if (match) {
      const prefix = match[1];
      const start = cursor - prefix.length;
      const newCode = code.substring(0, start) + suggestion + code.substring(cursor);
      setCode(newCode);
      setSuggestions([]);
      
      // Reset cursor position after state update
      setTimeout(() => {
        textarea.focus();
        const newPos = start + suggestion.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev + 1) % suggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertSuggestion(suggestions[suggestionIndex]);
        return;
      } else if (e.key === 'Escape') {
        setSuggestions([]);
        return;
      }
    }

    // Ctrl+Enter or Cmd+Enter to Run
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
      return;
    }

    // Tab support (insert 2 spaces)
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = code.substring(0, start) + "  " + code.substring(end);
      setCode(newCode);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }

    // Auto-indent on Enter
    if (e.key === 'Enter') {
      const cursor = textarea.selectionStart;
      const textBefore = code.substring(0, cursor);
      const lastLine = textBefore.split('\n').pop() || '';
      const indentMatch = lastLine.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      
      if (indent.length > 0) {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newCode = code.substring(0, start) + "\n" + indent + code.substring(end);
        setCode(newCode);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length;
        }, 0);
      }
    }
  };

  // Load saved codes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('haskell_saved_codes');
    if (saved) {
      setSavedCodes(JSON.parse(saved));
    }
  }, []);

  // Save codes to localStorage
  const saveCode = () => {
    const title = prompt('Dê um título para o seu código:', 'Meu Script Haskell');
    if (!title) return;

    const newSaved: SavedCode = {
      id: Date.now().toString(),
      title,
      code,
      timestamp: Date.now()
    };

    const updated = [newSaved, ...savedCodes];
    setSavedCodes(updated);
    localStorage.setItem('haskell_saved_codes', JSON.stringify(updated));
  };

  const deleteSaved = (id: string) => {
    const updated = savedCodes.filter(c => c.id !== id);
    setSavedCodes(updated);
    localStorage.setItem('haskell_saved_codes', JSON.stringify(updated));
  };

  const loadSaved = (saved: SavedCode) => {
    setCode(saved.code);
    setIsSidebarOpen(false);
  };

  const handleRun = async () => {
    setIsLoading(true);
    setOutput('Compilando e executando...');
    setReplHistory([]);
    setExplanation('');

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Você é um compilador Haskell educacional. Execute o seguinte código Haskell e forneça a saída exata que o GHCi produziria. Se houver erros de sintaxe ou lógica, forneça-os de forma clara.
        
        Código:
        \`\`\`haskell
        ${code}
        \`\`\`
        
        Responda APENAS com a saída do console ou a mensagem de erro. Não adicione explicações extras aqui.`,
      });

      setOutput(response.text || 'Nenhuma saída produzida.');
    } catch (error) {
      setOutput('Erro ao conectar com o compilador: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replInput.trim() || isReplLoading) return;

    const input = replInput.trim();
    setReplInput('');
    setReplHistory(prev => [...prev, { type: 'input', content: input }]);
    setIsReplLoading(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Você é um terminal GHCi. Eu fornecerei um código fonte Haskell (o contexto) e uma expressão para você avaliar nesse contexto.
        
        Contexto (Editor):
        \`\`\`haskell
        ${code}
        \`\`\`
        
        Expressão para avaliar:
        ${input}
        
        Responda APENAS com o resultado da avaliação ou a mensagem de erro. Não adicione explicações extras.`,
      });

      const result = response.text || 'Nenhum resultado.';
      const isError = result.toLowerCase().includes('error') || result.toLowerCase().includes('erro');
      setReplHistory(prev => [...prev, { type: isError ? 'error' : 'output', content: result }]);
    } catch (error) {
      setReplHistory(prev => [...prev, { type: 'error', content: 'Erro no REPL: ' + (error as Error).message }]);
    } finally {
      setIsReplLoading(false);
    }
  };

  const handleExplain = async () => {
    setIsLoading(true);
    setIsExplanationOpen(true);
    setExplanation('Analisando o código...');

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Você é um professor de Programação Funcional especializado em Haskell. Explique o código a seguir para um estudante universitário. Foque em conceitos como tipos, funções puras, imutabilidade, recursão e lazy evaluation, se aplicável.
        
        Código:
        \`\`\`haskell
        ${code}
        \`\`\`
        
        Forneça uma explicação pedagógica, clara e em português do Brasil. Use Markdown para formatar.`,
      });

      setExplanation(response.text || 'Não foi possível gerar uma explicação.');
    } catch (error) {
      setExplanation('Erro ao gerar explicação: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0b14] text-slate-100 font-sans selection:bg-cyan-500/30 overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 -right-24 w-80 h-80 bg-cyan-600/10 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 left-1/4 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
      </div>

      {/* --- Header --- */}
      <header className="shrink-0 z-40 w-full border-b border-white/5 bg-white/[0.02] backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2.5 hover:bg-white/5 rounded-xl transition-all active:scale-95 border border-transparent hover:border-white/10"
            >
              <Menu className="w-5 h-5 text-cyan-400" />
            </button>
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-600 to-cyan-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                <Code2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <h1 className="font-bold text-base tracking-tight leading-none">
                  Haskell <span className="text-cyan-400">Edu</span>
                </h1>
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-1">Functional Lab v2.0</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={handleExplain}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/10 rounded-xl transition-all disabled:opacity-50 border border-cyan-500/20 hover:border-cyan-500/40"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Análise IA</span>
            </button>
            <button 
              onClick={handleRun}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 border border-white/10"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              <span>Compilar</span>
            </button>
          </div>
        </div>
      </header>

      {/* --- Main Workspace --- */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        
        {/* Editor Area */}
        <div className="flex-1 flex overflow-hidden bg-transparent">
          {/* Line Numbers */}
          <div 
            ref={lineNumbersRef}
            className="w-14 shrink-0 bg-black/20 py-6 text-right pr-4 font-mono text-[11px] text-slate-600 select-none overflow-hidden border-r border-white/5"
          >
            {Array.from({ length: lineCount }).map((_, i) => (
              <div key={i} className={cn(
                "h-6 leading-6 transition-colors duration-200",
                i === activeLine ? "text-cyan-400 font-bold bg-cyan-400/5" : ""
              )}>{i + 1}</div>
            ))}
          </div>

          {/* Textarea & Highlighter */}
          <div className="flex-1 relative overflow-hidden group">
            {/* Highlighted Code (Behind) */}
            <pre
              ref={preRef}
              aria-hidden="true"
              className="absolute inset-0 p-6 font-mono text-sm leading-6 pointer-events-none whitespace-pre-wrap break-words overflow-hidden"
              dangerouslySetInnerHTML={{ __html: highlightHaskell(code) + '\n' }}
            />
            
            {/* Real Textarea (On Top) */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="absolute inset-0 w-full h-full p-6 bg-transparent font-mono text-sm leading-6 focus:outline-none resize-none text-transparent caret-cyan-400 whitespace-pre-wrap break-words overflow-auto"
              placeholder="-- Digite seu código Haskell aqui..."
            />

            {/* Autocomplete Dropdown */}
            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  style={{ 
                    top: suggestionPos.top, 
                    left: suggestionPos.left,
                    position: 'absolute'
                  }}
                  className="z-50 min-w-[160px] bg-[#1a1b26] border border-white/10 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl"
                >
                  {suggestions.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => insertSuggestion(s)}
                      onMouseEnter={() => setSuggestionIndex(i)}
                      className={cn(
                        "w-full text-left px-4 py-2 text-xs font-mono transition-colors flex items-center justify-between",
                        i === suggestionIndex ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/5"
                      )}
                    >
                      <span>{s}</span>
                      <span className="text-[9px] opacity-50 uppercase tracking-tighter">
                        {HASKELL_SUGGESTIONS.indexOf(s) < 21 ? 'keyword' : HASKELL_SUGGESTIONS.indexOf(s) < 32 ? 'type' : 'func'}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Floating Actions */}
            <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
              <button 
                onClick={copyToClipboard}
                className="p-2.5 bg-slate-900/90 hover:bg-indigo-600 rounded-xl text-white transition-all border border-white/10 backdrop-blur-md"
                title="Copiar código"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
              <button 
                onClick={saveCode}
                className="p-2.5 bg-slate-900/90 hover:bg-indigo-600 rounded-xl text-white transition-all border border-white/10 backdrop-blur-md"
                title="Salvar código"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Terminal Area (Bottom) */}
        <div className="h-64 sm:h-80 shrink-0 bg-black/40 border-t border-white/5 flex flex-col backdrop-blur-2xl">
          {/* Terminal Header */}
          <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400 uppercase tracking-[0.2em]">
                <Terminal className="w-4 h-4" />
                GHCi Interactive
              </div>
              <div className="h-4 w-[1px] bg-white/10" />
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                System Ready
              </div>
              <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-slate-600">
                <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">Ctrl+Enter</kbd>
                para rodar
              </div>
            </div>
            <button 
              onClick={() => { setOutput(''); setReplHistory([]); }}
              className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-red-400 transition-all flex items-center gap-2 text-[10px] uppercase tracking-wider"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 p-6 overflow-y-auto font-mono text-sm custom-scrollbar">
            {/* Main Execution Output */}
            {output && (
              <div className="mb-6 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                <div className="text-[10px] text-indigo-400 mb-2 uppercase tracking-widest font-bold">Execution Result</div>
                <pre className={cn(
                  "whitespace-pre-wrap",
                  output.includes('error') || output.includes('Erro') ? "text-red-400" : "text-emerald-400"
                )}>
                  {output}
                </pre>
              </div>
            )}

            {/* REPL History */}
            <div className="space-y-3">
              {replHistory.map((entry, i) => (
                <div key={i} className="flex flex-col gap-1 animate-in fade-in slide-in-from-left-2 duration-300">
                  {entry.type === 'input' ? (
                    <div className="flex items-start gap-2 text-cyan-400/80">
                      <span className="text-cyan-500 font-bold">λ</span>
                      <span>{entry.content}</span>
                    </div>
                  ) : (
                    <div className={cn(
                      "pl-4 border-l border-white/10 ml-1 py-1",
                      entry.type === 'error' ? "text-red-400" : "text-slate-300"
                    )}>
                      {entry.content}
                    </div>
                  )}
                </div>
              ))}
              {isReplLoading && (
                <div className="flex items-center gap-2 text-slate-500 italic animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Evaluating...
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* REPL Input */}
          <form onSubmit={handleReplSubmit} className="px-6 py-4 bg-black/20 border-t border-white/5">
            <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2 focus-within:border-cyan-500/30 transition-all">
              <span className="text-cyan-500 font-bold font-mono">λ</span>
              <input 
                type="text"
                value={replInput}
                onChange={(e) => setReplInput(e.target.value)}
                placeholder="Digite uma expressão Haskell (ex: map (+1) [1,2,3])"
                className="flex-1 bg-transparent border-none focus:outline-none text-sm font-mono text-slate-200 placeholder:text-slate-600"
              />
              <button 
                type="submit"
                disabled={!replInput.trim() || isReplLoading}
                className="p-1.5 hover:bg-white/5 rounded-lg text-cyan-500 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>

        {/* Explanation Overlay */}
        <AnimatePresence>
          {isExplanationOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 right-0 w-full sm:w-[500px] bg-[#0d0e1a]/95 backdrop-blur-3xl border-l border-white/5 z-30 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-tight">Análise Pedagógica</h2>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Functional Insight</p>
                  </div>
                </div>
                <button onClick={() => setIsExplanationOpen(false)} className="p-2 hover:bg-white/5 rounded-xl transition-all">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 p-8 overflow-y-auto prose prose-invert prose-cyan max-w-none prose-sm sm:prose-base custom-scrollbar">
                <ReactMarkdown>{explanation}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Sidebar (Templates & History) --- */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-80 bg-[#0d0e1a] border-r border-white/5 z-50 overflow-y-auto custom-scrollbar"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h2 className="text-lg font-bold tracking-tight">Laboratório</h2>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-xl transition-all">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <section className="mb-10">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 pl-1">Templates de Estudo</h3>
                  <div className="space-y-2">
                    {HASKELL_TEMPLATES.map(template => (
                      <button
                        key={template.id}
                        onClick={() => { setCode(template.code); setIsSidebarOpen(false); }}
                        className="w-full text-left p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all flex items-center justify-between group text-sm"
                      >
                        <span className="font-medium text-slate-300 group-hover:text-indigo-300">{template.title}</span>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-all translate-x-0 group-hover:translate-x-1" />
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6 pl-1">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Meus Experimentos</h3>
                    <History className="w-4 h-4 text-slate-600" />
                  </div>
                  {savedCodes.length === 0 ? (
                    <div className="p-6 rounded-2xl border border-dashed border-white/5 text-center">
                      <p className="text-xs text-slate-600 italic">Nenhum código salvo.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {savedCodes.map(saved => (
                        <div key={saved.id} className="group relative">
                          <button
                            onClick={() => loadSaved(saved)}
                            className="w-full text-left p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all text-sm"
                          >
                            <span className="font-medium block truncate pr-8 text-slate-300 group-hover:text-cyan-300">{saved.title}</span>
                            <span className="text-[9px] text-slate-600 font-mono mt-1 block">{new Date(saved.timestamp).toLocaleDateString()}</span>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteSaved(saved.id); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* --- Footer Info --- */}
      <footer className="shrink-0 px-6 py-2 border-t border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between text-[9px] text-slate-600 font-mono uppercase tracking-widest">
        <div>Haskell Functional Lab • University Edition</div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-cyan-500" />
            Gemini AI Engine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-indigo-500" />
            GHCi v9.2.1
          </span>
        </div>
      </footer>
    </div>
  );
}
