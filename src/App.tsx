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
  const [explanation, setExplanation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedCodes, setSavedCodes] = useState<SavedCode[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
      {/* --- Header --- */}
      <header className="shrink-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-indigo-400" />
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1 rounded-lg">
                <Code2 className="w-4 h-4 text-white" />
              </div>
              <h1 className="font-bold text-sm tracking-tight hidden xs:block">
                Haskell <span className="text-indigo-400">Edu</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleExplain}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/10 rounded-full transition-all disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Explicar</span>
            </button>
            <button 
              onClick={handleRun}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>Executar</span>
            </button>
          </div>
        </div>
      </header>

      {/* --- Main Workspace --- */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Editor Area */}
        <div className="flex-1 flex overflow-hidden bg-slate-900/50">
          {/* Line Numbers */}
          <div 
            ref={lineNumbersRef}
            className="w-12 shrink-0 bg-slate-900 border-r border-slate-800 py-4 text-right pr-3 font-mono text-xs text-slate-600 select-none overflow-hidden"
          >
            {Array.from({ length: lineCount }).map((_, i) => (
              <div key={i} className="h-6 leading-6">{i + 1}</div>
            ))}
          </div>

          {/* Textarea & Highlighter */}
          <div className="flex-1 relative overflow-hidden">
            {/* Highlighted Code (Behind) */}
            <pre
              ref={preRef}
              aria-hidden="true"
              className="absolute inset-0 p-4 font-mono text-sm leading-6 pointer-events-none whitespace-pre overflow-hidden"
              dangerouslySetInnerHTML={{ __html: highlightHaskell(code) + '\n' }}
            />
            
            {/* Real Textarea (On Top) */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onScroll={handleScroll}
              spellCheck={false}
              className="absolute inset-0 w-full h-full p-4 bg-transparent font-mono text-sm leading-6 focus:outline-none resize-none text-transparent caret-indigo-400 whitespace-pre overflow-auto"
              placeholder="-- Digite seu código Haskell aqui..."
            />
            
            {/* Floating Actions */}
            <div className="absolute top-4 right-4 flex gap-2 z-10">
              <button 
                onClick={copyToClipboard}
                className="p-2 bg-slate-800/80 hover:bg-indigo-600 rounded-lg text-white transition-colors"
                title="Copiar código"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={saveCode}
                className="p-2 bg-slate-800/80 hover:bg-indigo-600 rounded-lg text-white transition-colors"
                title="Salvar código"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Terminal Area (Bottom) */}
        <div className="h-48 sm:h-64 shrink-0 bg-slate-950 border-t border-slate-800 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 uppercase tracking-widest">
              <Terminal className="w-3.5 h-3.5" />
              Terminal
            </div>
            <button 
              onClick={() => setOutput('')}
              className="p-1 hover:bg-slate-800 rounded text-slate-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-sm">
            <pre className={cn(
              "whitespace-pre-wrap",
              output.includes('error') || output.includes('Erro') ? "text-red-400" : "text-emerald-400"
            )}>
              {output || <span className="text-slate-600 italic">Aguardando execução...</span>}
            </pre>
          </div>
        </div>

        {/* Explanation Overlay */}
        <AnimatePresence>
          {isExplanationOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 right-0 w-full sm:w-[450px] bg-slate-900 border-l border-slate-800 z-30 shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                  Explicação da IA
                </div>
                <button onClick={() => setIsExplanationOpen(false)} className="p-2 hover:bg-slate-800 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 p-6 overflow-y-auto prose prose-invert prose-indigo max-w-none">
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 z-50 overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    Biblioteca
                  </h2>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-800 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <section className="mb-8">
                  <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-4">Templates</h3>
                  <div className="space-y-1.5">
                    {HASKELL_TEMPLATES.map(template => (
                      <button
                        key={template.id}
                        onClick={() => { setCode(template.code); setIsSidebarOpen(false); }}
                        className="w-full text-left p-2.5 rounded-lg bg-slate-800/50 hover:bg-indigo-600/20 hover:text-indigo-300 transition-all flex items-center justify-between group text-sm"
                      >
                        <span className="font-medium">{template.title}</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Meus Códigos</h3>
                    <History className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  {savedCodes.length === 0 ? (
                    <p className="text-xs text-slate-500 italic px-2">Nenhum código salvo.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {savedCodes.map(saved => (
                        <div key={saved.id} className="group relative">
                          <button
                            onClick={() => loadSaved(saved)}
                            className="w-full text-left p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-all text-sm"
                          >
                            <span className="font-medium block truncate pr-6">{saved.title}</span>
                            <span className="text-[9px] text-slate-500">{new Date(saved.timestamp).toLocaleDateString()}</span>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteSaved(saved.id); }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      <footer className="fixed bottom-0 w-full p-4 text-center text-[10px] text-slate-600 bg-slate-950/80 backdrop-blur-sm">
        Desenvolvido para estudantes de Programação Funcional • Powered by Gemini AI
      </footer>
    </div>
  );
}
