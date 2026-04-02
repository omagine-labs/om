"""
Concrete LLM Analyzer Implementations

Four communication dimension analyzers:
- ClarityAnalyzer: Evaluates coherence and structure of communication
- ConfidenceAnalyzer: Evaluates tone and assertiveness
- CollaborationAnalyzer: Evaluates building on ideas and facilitation
- AttunementAnalyzer: Evaluates acknowledgement and responsiveness
"""

from .llm_analyzer import BaseLLMAnalyzer


class ClarityAnalyzer(BaseLLMAnalyzer):
    """
    Analyzes clarity of communication.

    Evaluates how clear, coherent, and well-structured the speaker's
    communication is based on their transcript segments.
    """

    @property
    def dimension_name(self) -> str:
        return "Clarity"

    @property
    def prompt_name(self) -> str:
        return "clarity-analysis"

    def _build_fallback_prompt(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> str:
        # Extract filler words metric from kwargs
        filler_words_per_minute = kwargs.get("filler_words_per_minute", 0.0)

        return f"""
Analyze {speaker_label}'s CLARITY based on their word choice in this meeting.

TRANSCRIPT:
{transcript_text}

METRICS:
- Filler word rate: {filler_words_per_minute:.1f} per minute (includes "um", "uh", "like", "you know", etc.)
- Meeting duration: {meeting_duration_minutes:.0f} minutes

WHAT TO EVALUATE:
Focus on *word choice and language patterns*, not delivery structure. Look for:

Clarity reducers:
- Filler words: "um", "uh", "like", "you know", "kind of", "sort of"
- Hedging language: "I think", "maybe", "probably", "I guess"
- Softeners: "just", "actually", "basically"
- Apologetic framing: "I'm not sure but…", "This might be wrong but…"
- Vague references: "this thing", "that stuff", "those issues" (without clarity)
- Jargon or acronyms without explanation
- Abstract language without concrete examples

Clarity indicators:
- Precise language: specific nouns, clear verbs, exact numbers
- Concrete examples: "For instance…", "Like when we…"
- Clear ownership: "I will…", "We should…" (vs. "it would be good if…")
- Defined terms: explaining acronyms or specialized language
- Direct statements: avoiding double negatives or convoluted phrasing

SCORING GUIDE:
- 1-3: Heavy filler usage, vague language dominates, hard to extract meaning
- 4-6: Some precise language but frequently falls back on hedging or vagueness
- 7-8: Mostly clear and specific, minimal filler words
- 9-10: Consistently precise, concrete examples, no unnecessary fillers

OUTPUT INSTRUCTIONS:
- Score: Integer from 1-10
- Explanation: 30-50 words, second person ("You..."), cite specific word choice patterns or examples from the transcript

Return ONLY valid JSON:
{{
  "score": <integer 1-10>,
  "explanation": "<30-50 word explanation in second person with specific examples>"
}}
"""


class ConfidenceAnalyzer(BaseLLMAnalyzer):
    """
    Analyzes confidence in communication.

    Evaluates the speaker's confidence level based on tone, assertiveness,
    and communication style from their transcript segments.
    """

    @property
    def dimension_name(self) -> str:
        return "Confidence"

    @property
    def prompt_name(self) -> str:
        return "confidence-analysis"

    def _build_fallback_prompt(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> str:
        # Extract metrics from kwargs
        verbosity = kwargs.get("verbosity", 0.0)
        words_per_minute = kwargs.get("words_per_minute", 0.0)

        return f"""
Analyze {speaker_label}'s CONFIDENCE based on their delivery style in this meeting.

TRANSCRIPT:
{transcript_text}

METRICS:
- Verbosity: {verbosity:.1f} words per segment (higher = more sustained speaking turns)
- Speaking pace: {words_per_minute:.0f} WPM (typical: 120-150 WPM; very fast may
  indicate rushing, very slow may indicate hesitation)
- Meeting duration: {meeting_duration_minutes:.0f} minutes

WHAT TO EVALUATE:
Focus on *delivery and structure*, not word choice. Look for:

Confident delivery patterns:
- Complete, fully-formed thoughts
- Getting to the point quickly (direct structure)
- Consistent pacing throughout responses
- Building momentum—responses that strengthen toward the end
- Concise responses that don't over-explain or ramble

Uncertain delivery patterns:
- Trailing off or incomplete thoughts ("So yeah..." "Anyway...")
- Self-interrupting or restarting mid-sentence
- Rambling or circling back to repeat the same point
- Burying the main point (excessive preamble before getting to it)
- Over-explaining or adding unnecessary caveats after making a point
- Responses that lose steam or weaken toward the end

SCORING GUIDE:
- 1-3: Fragmented delivery, frequently trails off, rambles, struggles to land points
- 4-6: Sometimes direct, but often loses focus or over-explains
- 7-8: Mostly clear and structured, finishes thoughts cleanly
- 9-10: Consistently crisp delivery; makes points directly and lands them confidently

OUTPUT INSTRUCTIONS:
- Score: Integer from 1-10
- Explanation: 30-50 words, second person ("You..."), cite specific patterns or moments from the transcript

Return ONLY valid JSON:
{{
  "score": <integer 1-10>,
  "explanation": "<30-50 word explanation in second person with specific examples>"
}}
"""


class AttunementAnalyzer(BaseLLMAnalyzer):
    """
    Analyzes attunement and acknowledgement.

    Evaluates the speaker's level of acknowledgement and responsiveness
    to others based on the full transcript. Note: Interruption rate is
    a separate metric and should not be blended with this score.
    """

    @property
    def dimension_name(self) -> str:
        return "Attunement"

    @property
    def prompt_name(self) -> str:
        return "attunement-analysis"

    def _build_fallback_prompt(
        self,
        speaker_label: str,
        transcript_text: str,
        talk_time_percentage: float,
        word_count: int,
        meeting_duration_minutes: float,
        total_speakers: int,
        **kwargs,
    ) -> str:
        # Use full_transcript from kwargs if available, otherwise use transcript_text
        full_transcript = kwargs.get("full_transcript", transcript_text)
        # Extract metrics from kwargs
        turn_taking_balance = kwargs.get("turn_taking_balance", 0.0)
        times_interrupting = kwargs.get("times_interrupting", 0)
        times_interrupted = kwargs.get("times_interrupted", 0)

        return f"""
Analyze {speaker_label}'s COLLABORATION abilities in this meeting using the transcript as well as hard metrics below.

TRANSCRIPT:
{full_transcript}

METRICS:
- Turn-taking balance: {turn_taking_balance:.1f} (negative = under-participated,
  positive = over-participated; -5 to +5 is balanced)
- Interruptions made: {times_interrupting}
- Interruptions received: {times_interrupted}
- Meeting duration: {meeting_duration_minutes:.0f} minutes

WHAT TO EVALUATE:
Look for collaboration signals in the transcript:
- Affirmations ("Great point", "I agree", "That makes sense")
- Building on others' ideas ("Adding to what [name] said...")
- Acknowledging contributions ("As [name] mentioned...")
- Asking clarifying or follow-up questions
- Inclusive language ("What do you think?", "I'd love your input")
- Interruption patterns (supportive vs. disruptive)

SCORING GUIDE:
- 1-3: Dismissive, talked over others, ignored contributions, dominated or disengaged
- 4-6: Some acknowledgment but inconsistent; missed opportunities to engage
- 7-8: Regularly affirmed others, balanced participation, built on ideas
- 9-10: Exceptional collaboration; consistently elevated others' contributions

OUTPUT INSTRUCTIONS:
- Score: Integer from 1-10
- Explanation: 30-50 words, second person ("You..."), include 1-2 specific quotes or examples from the transcript

Return ONLY valid JSON:
{{
  "score": <integer 1-10>,
  "explanation": "<30-50 word explanation in second person with specific examples>"
}}
"""
